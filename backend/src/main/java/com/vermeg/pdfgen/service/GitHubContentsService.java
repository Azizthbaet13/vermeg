package com.vermeg.pdfgen.service;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vermeg.pdfgen.dto.GitCommitRequestDTO;
import com.vermeg.pdfgen.dto.GitCommitResponseDTO;
import com.vermeg.pdfgen.exception.GitHubApiException;

@Service
public class GitHubContentsService {

    private static final Pattern SSH_REPO =
            Pattern.compile("^git@github\\.com:([^/]+)/(.+?)(?:\\.git)?$", Pattern.CASE_INSENSITIVE);

    private final RestClient github;
    private final ObjectMapper objectMapper;
    private final GitLocalPushService gitLocalPushService;

    public GitHubContentsService(ObjectMapper objectMapper, GitLocalPushService gitLocalPushService) {
        this.objectMapper = objectMapper;
        this.gitLocalPushService = gitLocalPushService;
        this.github = RestClient.builder()
                .baseUrl("https://api.github.com")
                .defaultHeader("Accept", "application/vnd.github+json")
                .defaultHeader("X-GitHub-Api-Version", "2022-11-28")
                .defaultHeader("User-Agent", "vermeg-pdf-gen")
                .build();
    }

    public GitCommitResponseDTO putFile(GitCommitRequestDTO request) {
        RepoRef repo = parseGithubUrl(request.getRepoUrl());
        String path = request.getFilePath().trim().replaceAll("^/+", "");
        if (path.isBlank()) {
            throw new IllegalArgumentException("Le chemin du fichier est obligatoire.");
        }
        String branch = request.getBranch().trim();
        String token = sanitizeToken(request.getToken());
        if (token.isBlank()) {
            return gitLocalPushService.commitAndPush(
                    branch, path, request.getContent(), request.getMessage());
        }

        try {
            return putViaGithubApi(repo, path, branch, token, request);
        } catch (GitHubApiException apiError) {
            int status = apiError.getStatus().value();
            if (status == 401 || status == 403 || status == 404) {
                try {
                    return gitLocalPushService.commitAndPush(
                            branch, path, request.getContent(), request.getMessage());
                } catch (GitHubApiException gitError) {
                    throw new GitHubApiException(
                            apiError.getStatus(),
                            apiError.getMessage() + " — repli git local : " + gitError.getMessage());
                }
            }
            throw apiError;
        }
    }

    private GitCommitResponseDTO putViaGithubApi(
            RepoRef repo, String path, String branch, String token, GitCommitRequestDTO request) {
        assertCanPush(repo, token);
        URI contentsUri = contentsUri(repo, path, null);
        String sha = getExistingSha(repo, path, branch, token);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", request.getMessage().trim());
        body.put("content", Base64.getEncoder().encodeToString(request.getContent().getBytes(StandardCharsets.UTF_8)));
        body.put("branch", branch);
        if (sha != null) {
            body.put("sha", sha);
        }

        try {
            github.put()
                    .uri(contentsUri)
                    .headers(headers -> headers.setBearerAuth(token))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException ex) {
            throw translate(ex);
        } catch (ResourceAccessException ex) {
            throw new GitHubApiException(
                    HttpStatus.BAD_GATEWAY,
                    "Impossible de joindre api.github.com : " + ex.getMostSpecificCause().getMessage());
        } catch (RestClientException ex) {
            throw new GitHubApiException(HttpStatus.BAD_GATEWAY, "Erreur d'appel GitHub : " + ex.getMessage());
        }

        return new GitCommitResponseDTO(path, branch, sha != null);
    }

    private String getExistingSha(RepoRef repo, String path, String branch, String token) {
        try {
            JsonNode existing = github.get()
                    .uri(contentsUri(repo, path, branch))
                    .headers(headers -> headers.setBearerAuth(token))
                    .retrieve()
                    .body(JsonNode.class);
            if (existing != null && "dir".equals(existing.path("type").asText())) {
                throw new GitHubApiException(
                        HttpStatus.BAD_REQUEST, "Le chemin pointe vers un dossier, pas un fichier.");
            }
            if (existing != null && existing.hasNonNull("sha")) {
                return existing.get("sha").asText();
            }
            return null;
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                return null;
            }
            throw translate(ex);
        } catch (ResourceAccessException ex) {
            throw new GitHubApiException(
                    HttpStatus.BAD_GATEWAY,
                    "Impossible de joindre api.github.com : " + ex.getMostSpecificCause().getMessage());
        } catch (RestClientException ex) {
            throw new GitHubApiException(HttpStatus.BAD_GATEWAY, "Erreur d'appel GitHub : " + ex.getMessage());
        }
    }

    private GitHubApiException translate(RestClientResponseException ex) {
        String githubMessage = extractGithubMessage(ex.getResponseBodyAsString());
        int code = ex.getStatusCode().value();
        String message = switch (code) {
            case 401 -> "GitHub a rejeté le token (401) : expiré, révoqué ou mal copié. "
                    + "Collez un PAT entier (ghp_… ou github_pat_…), sans le mot Bearer. "
                    + (githubMessage.isBlank() ? "" : "GitHub : " + githubMessage);
            case 403 -> "Token accepté mais sans droit d'écriture (403). Fine-grained : dépôt vermeg "
                    + "+ Contents = Read and write. Classic : cocher public_repo. "
                    + (githubMessage.isBlank() ? "" : "GitHub : " + githubMessage);
            case 404 -> "Dépôt, branche ou chemin introuvable (ou token sans accès : GitHub masque ça en 404).";
            case 409, 422 -> "Conflit GitHub (SHA du fichier). Rechargez puis réessayez."
                    + (githubMessage.isBlank() ? "" : " " + githubMessage);
            default -> githubMessage.isBlank()
                    ? "Erreur GitHub HTTP " + code
                    : "GitHub (" + code + ") : " + githubMessage;
        };
        return new GitHubApiException(ex.getStatusCode(), message);
    }

    private String extractGithubMessage(String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            return node.path("message").asText("");
        } catch (Exception ignored) {
            return body.length() > 240 ? body.substring(0, 240) : body;
        }
    }

    private void assertCanPush(RepoRef repo, String token) {
        try {
            JsonNode repoJson = github.get()
                    .uri("/repos/{owner}/{repo}", repo.owner(), repo.repo())
                    .headers(headers -> headers.setBearerAuth(token))
                    .retrieve()
                    .body(JsonNode.class);
            if (repoJson == null) {
                return;
            }
            JsonNode permissions = repoJson.path("permissions");
            if (permissions.isMissingNode() || permissions.isNull()) {
                return;
            }
            boolean canPush = permissions.path("push").asBoolean(false)
                    || permissions.path("admin").asBoolean(false)
                    || permissions.path("maintain").asBoolean(false);
            if (!canPush) {
                throw new GitHubApiException(
                        HttpStatus.FORBIDDEN,
                        "Le token n'a pas le droit push sur " + repo.owner() + "/" + repo.repo()
                                + ". Recréez un PAT avec Contents: Read and write (fine-grained) "
                                + "ou public_repo (classic), compte " + repo.owner() + ".");
            }
        } catch (GitHubApiException ex) {
            throw ex;
        } catch (RestClientResponseException ex) {
            throw translate(ex);
        } catch (ResourceAccessException ex) {
            throw new GitHubApiException(
                    HttpStatus.BAD_GATEWAY,
                    "Impossible de joindre api.github.com : " + ex.getMostSpecificCause().getMessage());
        } catch (RestClientException ex) {
            throw new GitHubApiException(HttpStatus.BAD_GATEWAY, "Erreur d'appel GitHub : " + ex.getMessage());
        }
    }

    static String sanitizeToken(String raw) {
        if (raw == null) {
            return "";
        }
        String token = raw.strip()
                .replace("\u200b", "")
                .replace("\"", "")
                .replace("'", "");
        if (token.regionMatches(true, 0, "Bearer ", 0, 7)) {
            token = token.substring(7).strip();
        } else if (token.regionMatches(true, 0, "token ", 0, 6)) {
            token = token.substring(6).strip();
        }
        return token.replaceAll("\\s+", "");
    }

    private static URI contentsUri(RepoRef repo, String path, String ref) {
        String encodedOwner = java.net.URLEncoder.encode(repo.owner(), StandardCharsets.UTF_8);
        String encodedRepo = java.net.URLEncoder.encode(repo.repo(), StandardCharsets.UTF_8);
        String uri = "https://api.github.com/repos/" + encodedOwner + "/" + encodedRepo + "/contents/" + encodePath(path);
        if (ref != null && !ref.isBlank()) {
            uri += "?ref=" + java.net.URLEncoder.encode(ref, StandardCharsets.UTF_8);
        }
        return URI.create(uri);
    }

    record RepoRef(String owner, String repo) {}

    static RepoRef parseGithubUrl(String url) {
        String trimmed = url == null ? "" : url.trim();
        if (trimmed.isBlank()) {
            throw new IllegalArgumentException("URL GitHub invalide.");
        }
        Matcher ssh = SSH_REPO.matcher(trimmed);
        if (ssh.matches()) {
            return new RepoRef(ssh.group(1), stripGitSuffix(ssh.group(2)));
        }
        try {
            URI parsed = URI.create(trimmed);
            String host = parsed.getHost() == null ? "" : parsed.getHost();
            if (!host.contains("github.com")) {
                throw new IllegalArgumentException("URL GitHub invalide. Exemple : https://github.com/owner/repo");
            }
            String[] parts = Arrays.stream(parsed.getPath().split("/"))
                    .filter(part -> !part.isBlank())
                    .toArray(String[]::new);
            if (parts.length < 2) {
                throw new IllegalArgumentException("URL GitHub invalide. Exemple : https://github.com/owner/repo");
            }
            return new RepoRef(parts[0], stripGitSuffix(parts[1]));
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("URL GitHub invalide.");
        }
    }

    private static String stripGitSuffix(String repo) {
        return repo.endsWith(".git") ? repo.substring(0, repo.length() - 4) : repo;
    }

    /**
     * Encode each path segment but keep slashes so Contents API receives templates/file.json.
     */
    static String encodePath(String path) {
        return Arrays.stream(path.split("/"))
                .filter(segment -> !segment.isBlank())
                .map(segment -> java.net.URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20"))
                .collect(Collectors.joining("/"));
    }
}
