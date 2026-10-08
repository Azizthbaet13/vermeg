package com.vermeg.pdfgen.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.vermeg.pdfgen.dto.GitCommitRequestDTO;
import com.vermeg.pdfgen.dto.GitCommitResponseDTO;
import com.vermeg.pdfgen.service.GitHubContentsService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/git")
@Tag(name = "Git", description = "Commit / push d'un fichier template")
public class GitController {

    private final GitHubContentsService gitHubContentsService;

    public GitController(GitHubContentsService gitHubContentsService) {
        this.gitHubContentsService = gitHubContentsService;
    }

    @PostMapping("/commit")
    @Operation(summary = "Commit et push un fichier JSON de template")
    public GitCommitResponseDTO commit(@Valid @RequestBody GitCommitRequestDTO request) {
        return gitHubContentsService.putFile(request);
    }
}
