package com.vermeg.pdfgen.exception;

public class TemplateNotFoundException extends RuntimeException {

    public TemplateNotFoundException(Long id) {
        super("Template introuvable : " + id);
    }
}
