package com.vermeg.pdfgen.controller;

import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.vermeg.pdfgen.service.PdfGenerationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/templates")
@Tag(name = "PDF", description = "Génération PDF via Playwright / Chrome")
public class PdfController {

    private final PdfGenerationService pdfGenerationService;

    public PdfController(PdfGenerationService pdfGenerationService) {
        this.pdfGenerationService = pdfGenerationService;
    }

    @PostMapping(value = "/{id}/generate", produces = MediaType.APPLICATION_PDF_VALUE)
    @Operation(summary = "Générer un PDF", description = "Corps JSON métier optionnel. Clé __pdfRenderedHtml : HTML déjà rendu.")
    public ResponseEntity<byte[]> generate(
            @PathVariable Long id, @RequestBody(required = false) Map<String, Object> data) {
        byte[] pdf = pdfGenerationService.generate(id, data);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"document.pdf\"")
                .body(pdf);
    }
}
