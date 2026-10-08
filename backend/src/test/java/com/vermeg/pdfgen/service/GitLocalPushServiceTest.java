package com.vermeg.pdfgen.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import com.vermeg.pdfgen.exception.GitHubApiException;

class GitLocalPushServiceTest {

    @Test
    void acceptsTemplateJsonPath() {
        assertEquals("templates/aziznn.json", GitLocalPushService.normalizeTemplatePath("templates/aziznn.json"));
    }

    @Test
    void rejectsPathOutsideTemplates() {
        assertThrows(GitHubApiException.class, () -> GitLocalPushService.normalizeTemplatePath("../secret.json"));
        assertThrows(GitHubApiException.class, () -> GitLocalPushService.normalizeTemplatePath("src/app.ts"));
    }
}
