package com.vermeg.pdfgen.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.vermeg.pdfgen.dto.ErrorResponse;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> noResource(NoResourceFoundException ex) {
        return error(HttpStatus.NOT_FOUND, "Ressource introuvable : " + ex.getResourcePath());
    }

    @ExceptionHandler(GitHubApiException.class)
    public ResponseEntity<ErrorResponse> github(GitHubApiException ex) {
        HttpStatus status = HttpStatus.resolve(ex.getStatus().value());
        if (status == null) {
            status = HttpStatus.BAD_GATEWAY;
        }
        return error(status, ex.getMessage());
    }

    @ExceptionHandler(TemplateNotFoundException.class)
    public ResponseEntity<ErrorResponse> notFound(TemplateNotFoundException ex) {
        return error(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, IllegalArgumentException.class})
    public ResponseEntity<ErrorResponse> badRequest(Exception ex) {
        return error(HttpStatus.BAD_REQUEST, "JSON malformé ou requête invalide : " + ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> validation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + " : " + error.getDefaultMessage())
                .orElse("Requête invalide");
        return error(HttpStatus.BAD_REQUEST, message);
    }

    @ExceptionHandler(PdfGenerationException.class)
    public ResponseEntity<ErrorResponse> pdfFailed(PdfGenerationException ex) {
        log.error("Échec génération PDF", ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage());
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ErrorResponse> dataAccess(DataAccessException ex) {
        Throwable root = ex.getMostSpecificCause();
        String detail = root.getMessage() != null ? root.getMessage() : ex.getMessage();
        log.error("Erreur base de données", ex);
        String lower = detail == null ? "" : detail.toLowerCase();
        if (lower.contains("data too long") || lower.contains("data truncation")) {
            return error(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Le HTML/CSS dépasse la taille des colonnes MySQL. Relancez le backend : migration LONGTEXT au démarrage.");
        }
        if (lower.contains("max_allowed_packet") || lower.contains("packet for query is too large")) {
            return error(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Paquet MySQL trop petit. Dans MySQL : SET GLOBAL max_allowed_packet=67108864;");
        }
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur base de données : " + detail);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> fallback(Exception ex) {
        log.error("Erreur interne", ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur interne : " + ex.getMessage());
    }

    private ResponseEntity<ErrorResponse> error(HttpStatus status, String message) {
        return ResponseEntity.status(status)
                .body(new ErrorResponse(status.value(), status.getReasonPhrase(), message));
    }
}
