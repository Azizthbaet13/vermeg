package com.vermeg.pdfgen.config;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserType;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.PlaywrightException;

@Configuration
public class PlaywrightConfig {

    private static final Logger log = LoggerFactory.getLogger(PlaywrightConfig.class);

    @Bean(destroyMethod = "close")
    @Lazy
    public Playwright playwright() {
        return Playwright.create();
    }

    @Bean(destroyMethod = "close")
    @Lazy
    public Browser browser(
            Playwright playwright,
            @Value("${playwright.headless:true}") boolean headless,
            @Value("${playwright.channel:}") String channel,
            @Value("${playwright.executable-path:}") String executablePath) {
        List<String> errors = new ArrayList<>();

        Path chrome = resolveChrome(executablePath);
        if (chrome != null) {
            try {
                Browser browser = playwright.chromium().launch(
                        new BrowserType.LaunchOptions()
                                .setHeadless(headless)
                                .setExecutablePath(chrome));
                log.info("Playwright PDF : Chrome {}", chrome);
                return browser;
            } catch (PlaywrightException ex) {
                errors.add("executable " + chrome + " : " + ex.getMessage());
            }
        }

        for (String candidate : channels(channel)) {
            try {
                Browser browser = playwright.chromium().launch(
                        new BrowserType.LaunchOptions()
                                .setHeadless(headless)
                                .setChannel(candidate));
                log.info("Playwright PDF : canal {}", candidate);
                return browser;
            } catch (RuntimeException ex) {
                errors.add("canal " + candidate + " : " + ex.getMessage());
            }
        }

        try {
            Browser browser = playwright.chromium().launch(
                    new BrowserType.LaunchOptions().setHeadless(headless));
            log.info("Playwright PDF : Chromium embarqué");
            return browser;
        } catch (RuntimeException ex) {
            errors.add("chromium : " + ex.getMessage());
            throw new IllegalStateException(
                    "Impossible de lancer un navigateur pour le PDF. Installez Google Chrome ou Edge. "
                            + String.join(" | ", errors),
                    ex);
        }
    }

    private static List<String> channels(String configured) {
        List<String> channels = new ArrayList<>();
        if (configured != null && !configured.isBlank()) {
            channels.add(configured.trim());
        }
        channels.add("chrome");
        channels.add("msedge");
        return channels;
    }

    private static Path resolveChrome(String configured) {
        List<Path> candidates = new ArrayList<>();
        if (configured != null && !configured.isBlank()) {
            candidates.add(Path.of(configured));
        }
        String programFiles = System.getenv("ProgramFiles");
        String programFilesX86 = System.getenv("ProgramFiles(x86)");
        String localAppData = System.getenv("LOCALAPPDATA");
        if (programFiles != null) {
            candidates.add(Path.of(programFiles, "Google", "Chrome", "Application", "chrome.exe"));
            candidates.add(Path.of(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"));
        }
        if (programFilesX86 != null) {
            candidates.add(Path.of(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"));
            candidates.add(Path.of(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"));
        }
        if (localAppData != null) {
            candidates.add(Path.of(localAppData, "Google", "Chrome", "Application", "chrome.exe"));
        }
        return candidates.stream().filter(Files::isRegularFile).findFirst().orElse(null);
    }
}
