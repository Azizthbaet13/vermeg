package com.vermeg.pdfgen.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vermeg.pdfgen.model.TableSchema;
import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;
import com.vermeg.pdfgen.service.format.BooleanCellFormatter;
import com.vermeg.pdfgen.service.format.CellFormatter;
import com.vermeg.pdfgen.service.format.CurrencyCellFormatter;
import com.vermeg.pdfgen.service.format.DateCellFormatter;
import com.vermeg.pdfgen.service.format.NumberCellFormatter;
import com.vermeg.pdfgen.service.format.PercentageCellFormatter;
import com.vermeg.pdfgen.service.format.TextCellFormatter;

class TableRenderingServiceTest {

    private TableRenderingService service;

    @BeforeEach
    void setUp() {
        List<CellFormatter> formatters = List.of(
                new TextCellFormatter(),
                new NumberCellFormatter(),
                new CurrencyCellFormatter(),
                new DateCellFormatter(),
                new PercentageCellFormatter(),
                new BooleanCellFormatter());
        service = new TableRenderingService(new ObjectMapper(), formatters);
    }

    @Test
    void replacesPlaceholderWithFullTableAndFormatsCells() {
        TableSchema schema = articlesSchema();
        String html = "<h3>Articles</h3>{{table:articles}}<p>Fin</p>";
        Map<String, Object> data = Map.of(
                "articles",
                List.of(Map.of(
                        "label", "Support",
                        "quantity", 2,
                        "unitPrice", 1250,
                        "discount", 10,
                        "deliveryDate", "2027-07-15",
                        "paid", false)));

        String result = service.render(html, service.serializeSchemas(List.of(schema)), data);

        assertThat(result).doesNotContain("{{table:articles}}");
        assertThat(result).contains("<table class=\"tpl-table\" data-table=\"articles\">");
        assertThat(result).contains("<th>Article</th>");
        assertThat(result).contains("<th>Prix unitaire</th>");
        assertThat(result).contains("Support");
        assertThat(result).contains("TND");
        assertThat(result).contains("15/07/2027");
        assertThat(result).contains("10");
        assertThat(result).contains("%");
        assertThat(result).contains("Non");
    }

    @Test
    void missingSchemaReplacesPlaceholderWithEmptyString() {
        String result = service.render("Avant {{table:inconnu}} Après", "[]", Map.of());

        assertThat(result).isEqualTo("Avant  Après");
    }

    @Test
    void missingOrEmptyDataKeepsHeadersOnly() {
        TableSchema schema = articlesSchema();
        String schemas = service.serializeSchemas(List.of(schema));

        String missing = service.render("{{table:articles}}", schemas, Map.of());
        String empty = service.render("{{table:articles}}", schemas, Map.of("articles", List.of()));

        assertThat(missing).contains("<thead>");
        assertThat(missing).contains("<th>Article</th>");
        assertThat(missing).contains("<tbody></tbody>");
        assertThat(missing).doesNotContain("<td>");
        assertThat(empty).contains("<tbody></tbody>");
    }

    @Test
    void unknownColumnTypeFallsBackToTextAndEscapesHtml() {
        TableSchema schema = new TableSchema();
        schema.setId("notes");
        schema.setDataKey("notes");
        ColumnDefinition column = new ColumnDefinition();
        column.setKey("html");
        column.setLabel("Note");
        column.setType("custom");
        schema.setColumns(List.of(column));

        String result = service.render(
                "{{table:notes}}",
                service.serializeSchemas(List.of(schema)),
                Map.of("notes", List.of(Map.of("html", "<script>alert(1)</script>"))));

        assertThat(result).contains("&lt;script&gt;alert(1)&lt;/script&gt;");
        assertThat(result).doesNotContain("<script>");
    }

    private static TableSchema articlesSchema() {
        TableSchema schema = new TableSchema();
        schema.setId("articles");
        schema.setDataKey("articles");
        schema.setColumns(List.of(
                column("label", "Article", "text", null),
                column("quantity", "Qté", "number", null),
                column("unitPrice", "Prix unitaire", "currency", "TND"),
                column("discount", "Remise", "percentage", null),
                column("deliveryDate", "Livraison", "date", null),
                column("paid", "Payé", "boolean", null)));
        return schema;
    }

    private static ColumnDefinition column(String key, String label, String type, String currency) {
        ColumnDefinition column = new ColumnDefinition();
        column.setKey(key);
        column.setLabel(label);
        column.setType(type);
        column.setCurrencyCode(currency);
        return column;
    }
}
