package com.vermeg.pdfgen.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Hibernate {@code ddl-auto: update} does not widen TEXT/JSON to LONGTEXT.
 * Word/NDT templates exceed 64 KB and fail POST /api/templates with HTTP 500.
 */
@Component
public class TemplateSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TemplateSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public TemplateSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        String[] columns = {
            "header_html",
            "body_html",
            "footer_html",
            "header_css",
            "body_css",
            "footer_css",
            "tables_schema_json",
            "headerHtml",
            "bodyHtml",
            "footerHtml",
            "headerCss",
            "bodyCss",
            "footerCss",
            "tablesSchemaJson",
        };
        for (String column : columns) {
            try {
                jdbcTemplate.execute("ALTER TABLE templates MODIFY `" + column + "` LONGTEXT");
                log.info("Colonne templates.{} passée en LONGTEXT.", column);
            } catch (Exception ex) {
                log.debug("ALTER {} ignoré : {}", column, ex.getMessage());
            }
        }
    }
}
