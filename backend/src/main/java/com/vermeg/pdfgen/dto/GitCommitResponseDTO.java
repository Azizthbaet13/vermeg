package com.vermeg.pdfgen.dto;

public class GitCommitResponseDTO {

    private String path;
    private String branch;
    private boolean updated;

    public GitCommitResponseDTO(String path, String branch, boolean updated) {
        this.path = path;
        this.branch = branch;
        this.updated = updated;
    }

    public String getPath() {
        return path;
    }

    public String getBranch() {
        return branch;
    }

    public boolean isUpdated() {
        return updated;
    }
}
