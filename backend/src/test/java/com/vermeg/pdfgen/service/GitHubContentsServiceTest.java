package com.vermeg.pdfgen.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GitHubContentsServiceTest {

    @Test
    void parsesHttpsUrlAndIgnoresExtraPath() {
        GitHubContentsService.RepoRef repo =
                GitHubContentsService.parseGithubUrl("https://github.com/Azizthbaet13/vermeg/branches");
        assertEquals("Azizthbaet13", repo.owner());
        assertEquals("vermeg", repo.repo());
    }

    @Test
    void encodesContentsPathSegments() {
        assertEquals("templates/aziznn.json", GitHubContentsService.encodePath("templates/aziznn.json"));
    }

    @Test
    void sanitizesBearerPrefixAndWhitespace() {
        assertEquals("ghp_abc", GitHubContentsService.sanitizeToken("  Bearer ghp_abc\n"));
        assertEquals("github_pat_x", GitHubContentsService.sanitizeToken("token github_pat_x"));
    }
}
