package com.vermeg.pdfgen.dto;

import jakarta.validation.constraints.NotBlank;

public class GitCommitRequestDTO {

    @NotBlank
    private String repoUrl;

    private String token;

    @NotBlank
    private String branch;

    @NotBlank
    private String filePath;

    @NotBlank
    private String content;

    @NotBlank
    private String message;

    public String getRepoUrl() {
        return repoUrl;
    }

    public void setRepoUrl(String repoUrl) {
        this.repoUrl = repoUrl;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getBranch() {
        return branch;
    }

    public void setBranch(String branch) {
        this.branch = branch;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
