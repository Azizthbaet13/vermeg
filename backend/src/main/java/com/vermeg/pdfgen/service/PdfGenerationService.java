package com.vermeg.pdfgen.service;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;
import org.thymeleaf.exceptions.TemplateProcessingException;

import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.Margin;
import com.microsoft.playwright.options.WaitUntilState;
import com.vermeg.pdfgen.entity.Template;
import com.vermeg.pdfgen.exception.PdfGenerationException;

@Service
public class PdfGenerationService {

    static final String RENDERED_HTML_KEY = "__pdfRenderedHtml";

    private final TemplateService templateService;
    private final TableRenderingService tableRenderingService;
    private final VariablePreprocessorService variablePreprocessorService;
    private final TemplateEngine stringTemplateEngine;
    private final Browser browser;

    public PdfGenerationService(
            TemplateService templateService,
            TableRenderingService tableRenderingService,
            VariablePreprocessorService variablePreprocessorService,
            @Qualifier("stringTemplateEngine") TemplateEngine stringTemplateEngine,
            @Lazy Browser browser) {
        this.templateService = templateService;
        this.tableRenderingService = tableRenderingService;
        this.variablePreprocessorService = variablePreprocessorService;
        this.stringTemplateEngine = stringTemplateEngine;
        this.browser = browser;
    }

    public byte[] generate(Long templateId, Map<String, Object> data) {
        Map<String, Object> payload = data != null ? new LinkedHashMap<>(data) : new LinkedHashMap<>();
        Object rendered = payload.remove(RENDERED_HTML_KEY);
        if (rendered instanceof String html && !html.isBlank()) {
            return renderPdf(ensureDocument(html));
        }

        Template template = templateService.findOrThrow(templateId);
        String assembled = assembleHtml(template);
        String withTables = tableRenderingService.render(
                assembled, template.getTablesSchemaJson(), payload);
        String thymeleafSource = variablePreprocessorService.preprocess(withTables);
        String finalHtml = renderThymeleaf(thymeleafSource, payload);
        return renderPdf(finalHtml);
    }

    private String assembleHtml(Template template) {
        return """
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="UTF-8" />
                  <style>
                %s
                %s
                %s
                  </style>
                </head>
                <body>
                  <div class="tpl-header">%s</div>
                  <div class="tpl-body">%s</div>
                  <div class="tpl-footer">%s</div>
                </body>
                </html>
                """.formatted(
                nullToEmpty(template.getHeaderCss()),
                nullToEmpty(template.getBodyCss()),
                nullToEmpty(template.getFooterCss()),
                nullToEmpty(template.getHeaderHtml()),
                nullToEmpty(template.getBodyHtml()),
                nullToEmpty(template.getFooterHtml()));
    }

    private String renderThymeleaf(String source, Map<String, Object> data) {
        try {
            Context context = new Context();
            data.forEach(context::setVariable);
            return stringTemplateEngine.process(source, context);
        } catch (TemplateProcessingException ex) {
            throw new PdfGenerationException(
                    "Le HTML du template n'est pas compatible Thymeleaf (syntaxe Velocity ${…} / #if). "
                            + "Réessayez depuis l'éditeur : le HTML déjà rendu de l'aperçu sera envoyé. Détail : "
                            + ex.getMessage(),
                    ex);
        }
    }

    private static final String PRINT_FIT_CSS = """
            @page { size: A4; margin: 8mm; }
            html, body, .tpl-root, .tpl-header, .tpl-body, .tpl-footer {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              box-sizing: border-box !important;
            }
            body { height: auto !important; padding: 0 !important; }
            table { width: 100% !important; max-width: 100% !important; }
            img { max-width: 100% !important; height: auto; }
            .WordSection1, div[class*="WordSection"] {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
            }
            """;

    private byte[] renderPdf(String html) {
        try (BrowserContext context = browser.newContext(
                new Browser.NewContextOptions().setViewportSize(794, 1123));
                Page page = context.newPage()) {
            page.setDefaultTimeout(120_000);
            page.setContent(
                    html,
                    new Page.SetContentOptions()
                            .setWaitUntil(WaitUntilState.LOAD)
                            .setTimeout(120_000));
            return page.pdf(new Page.PdfOptions()
                    .setFormat("A4")
                    .setPrintBackground(true)
                    .setPreferCSSPageSize(true)
                    .setMargin(new Margin()
                            .setTop("0")
                            .setRight("0")
                            .setBottom("0")
                            .setLeft("0")));
        } catch (RuntimeException ex) {
            throw new PdfGenerationException(
                    "Échec de la génération PDF (Playwright) : " + rootMessage(ex), ex);
        }
    }

    private static String ensureDocument(String html) {
        String trimmed = injectPrintFitCss(html.trim());
        String head = trimmed.length() > 9 ? trimmed.substring(0, 9) : trimmed;
        if (head.regionMatches(true, 0, "<!doctype", 0, Math.min(9, head.length()))
                || head.regionMatches(true, 0, "<html", 0, Math.min(5, head.length()))) {
            return trimmed;
        }
        return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"/><style>"
                + PRINT_FIT_CSS
                + "</style></head><body>"
                + trimmed
                + "</body></html>";
    }

    private static String injectPrintFitCss(String html) {
        String style = "<style data-pdf-fit=\"true\">" + PRINT_FIT_CSS + "</style>";
        int headClose = html.toLowerCase().indexOf("</head>");
        if (headClose >= 0) {
            return html.substring(0, headClose) + style + html.substring(headClose);
        }
        if (html.toLowerCase().contains("<style")) {
            return style + html;
        }
        return style + html;
    }

    private static String rootMessage(Throwable ex) {
        Throwable current = ex;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message != null && !message.isBlank() ? message : ex.getClass().getSimpleName();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}

