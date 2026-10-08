package com.vermeg.pdfgen.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.vermeg.pdfgen.dto.GitCommitResponseDTO;
import com.vermeg.pdfgen.exception.GitHubApiException;

@Service
public class GitLocalPushService {

    private String lastOutput = "";

    private static final Logger log = LoggerFactory.getLogger(GitLocalPushService.class);
    private static final int TIMEOUT_SEC = 90;

    private final Path repoRoot;

    public GitLocalPushService(@Value("${github.repo-root:}") String configuredRoot) {
        this.repoRoot = resolveRepoRoot(configuredRoot);
    }

    public GitCommitResponseDTO commitAndPush(String branch, String filePath, String content, String message) {
        if (repoRoot == null) {
            throw new GitHubApiException(
                    HttpStatus.BAD_GATEWAY,
                    "Dépôt git local introuvable. Lancez le backend depuis le projet, ou définissez github.repo-root.");
        }

        String normalizedBranch = normalizeBranch(branch);
        String relativePath = normalizeTemplatePath(filePath);
        Path work = null;
        try {
            work = Files.createTempDirectory("vermeg-tpl-");
            run(repoRoot, "git", "fetch", "origin", normalizedBranch);
            run(repoRoot, "git", "worktree", "add", "--detach", work.toString(), "origin/" + normalizedBranch);

            Path dest = work.resolve(relativePath).normalize();
            if (!dest.startsWith(work)) {
                throw new GitHubApiException(HttpStatus.BAD_REQUEST, "Chemin de fichier invalide.");
            }
            boolean existed = Files.exists(dest);
            Files.createDirectories(dest.getParent());
            Files.writeString(dest, content, StandardCharsets.UTF_8);

            run(work, "git", "add", "--", relativePath);
            int dirty = runAllow(work, "git", "diff", "--cached", "--quiet");
            if (dirty == 0) {
                return new GitCommitResponseDTO(relativePath, normalizedBranch, existed);
            }

            String authorName = firstNonBlank(runCapture(repoRoot, "git", "log", "-1", "--format=%an"), "Vermeg Studio");
            String authorEmail = firstNonBlank(runCapture(repoRoot, "git", "log", "-1", "--format=%ae"), "studio@vermeg.local");
            run(work,
                    "git",
                    "-c", "user.name=" + authorName,
                    "-c", "user.email=" + authorEmail,
                    "commit",
                    "-m", message.trim());
            run(work, "git", "push", "origin", "HEAD:" + normalizedBranch);
            return new GitCommitResponseDTO(relativePath, normalizedBranch, existed);
        } catch (GitHubApiException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new GitHubApiException(
                    HttpStatus.BAD_GATEWAY, "Échec git local : " + rootMessage(ex));
        } finally {
            if (work != null) {
                cleanupWorktree(work);
            }
        }
    }

    static String normalizeTemplatePath(String filePath) {
        String path = filePath == null ? "" : filePath.trim().replace('\\', '/').replaceAll("^/+", "");
        if (path.isBlank() || path.contains("..") || path.startsWith("templates/") == false) {
            throw new GitHubApiException(
                    HttpStatus.BAD_REQUEST,
                    "Le fichier doit être sous templates/ (ex. templates/mon-modele.json).");
        }
        if (!path.matches("templates/[A-Za-z0-9._-]+")) {
            throw new GitHubApiException(
                    HttpStatus.BAD_REQUEST,
                    "Nom de fichier invalide. Utilisez uniquement lettres, chiffres, point, _ ou -.");
        }
        return path;
    }

    static String normalizeBranch(String branch) {
        String value = branch == null ? "" : branch.trim();
        if (!value.matches("[A-Za-z0-9._/-]+")) {
            throw new GitHubApiException(HttpStatus.BAD_REQUEST, "Nom de branche invalide.");
        }
        return value;
    }

    private void cleanupWorktree(Path work) {
        try {
            runAllow(repoRoot, "git", "worktree", "remove", "--force", work.toString());
        } catch (Exception ignored) {
            log.warn("Impossible de retirer le worktree git {}", work);
        }
        try (Stream<Path> walk = Files.walk(work)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // best effort
                }
            });
        } catch (IOException ignored) {
            // best effort
        }
    }

    private void run(Path cwd, String... command) throws IOException, InterruptedException {
        int code = runAllow(cwd, command);
        if (code != 0) {
            throw new GitHubApiException(
                    HttpStatus.BAD_GATEWAY,
                    "Commande git échouée (" + String.join(" ", command) + "). "
                            + (lastOutput.isBlank() ? "Code " + code : lastOutput));
        }
    }

    private int runAllow(Path cwd, String... command) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(cwd.toFile());
        builder.redirectErrorStream(true);
        builder.environment().put("GIT_TERMINAL_PROMPT", "0");
        builder.environment().put("GCM_INTERACTIVE", "Never");
        Process process = builder.start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        boolean finished = process.waitFor(TIMEOUT_SEC, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            throw new GitHubApiException(HttpStatus.BAD_GATEWAY, "Timeout git : " + String.join(" ", command));
        }
        int code = process.exitValue();
        if (code != 0 && !(command.length > 1 && "diff".equals(command[1]))) {
            log.warn("git {} -> {} : {}", String.join(" ", command), code, output.strip());
        }
        lastOutput = output.strip();
        return code;
    }

    private String runCapture(Path cwd, String... command) {
        try {
            ProcessBuilder builder = new ProcessBuilder(command);
            builder.directory(cwd.toFile());
            builder.redirectErrorStream(true);
            Process process = builder.start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            process.waitFor(TIMEOUT_SEC, TimeUnit.SECONDS);
            return process.exitValue() == 0 ? output : "";
        } catch (Exception ex) {
            return "";
        }
    }

    static Path resolveRepoRoot(String configuredRoot) {
        List<Path> candidates = new ArrayList<>();
        if (configuredRoot != null && !configuredRoot.isBlank()) {
            candidates.add(Path.of(configuredRoot).toAbsolutePath().normalize());
        }
        Path cwd = Path.of("").toAbsolutePath().normalize();
        candidates.add(cwd);
        candidates.add(cwd.getParent());
        for (Path candidate : candidates) {
            if (candidate != null && Files.isDirectory(candidate.resolve(".git"))) {
                return candidate;
            }
        }
        return null;
    }

    private static String firstNonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String rootMessage(Exception ex) {
        Throwable current = ex;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message == null || message.isBlank() ? ex.getClass().getSimpleName() : message;
    }
}
