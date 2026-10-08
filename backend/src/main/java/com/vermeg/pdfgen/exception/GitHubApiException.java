package com.vermeg.pdfgen.exception;

import org.springframework.http.HttpStatusCode;

public class GitHubApiException extends RuntimeException {

    private final HttpStatusCode status;

    public GitHubApiException(HttpStatusCode status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatusCode getStatus() {
        return status;
    }
}
