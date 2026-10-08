package com.vermeg.pdfgen.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vermeg.pdfgen.model.TableSchema;
import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;
import com.vermeg.pdfgen.service.format.CellFormatter;
import com.vermeg.pdfgen.service.format.TextCellFormatter;

/**
 * Remplace chaque placeholder {@code {{table:id}}} par un {@code <table>}
 * complet (thead + tbody) généré à partir du schéma de colonnes.
 *
 * <p>Comportement par défaut si le schéma est introuvable : chaîne vide.
 * Si le schéma existe mais les données sont absentes ou vides : tableau
 * avec en-têtes uniquement (tbody vide).
 */
@Service
public class TableRenderingService {

    private static final Pattern TABLE_PLACEHOLDER =
            Pattern.compile("\\{\\{\\s*table:([a-zA-Z0-9_-]+)\\s*\\}\\}");

    private final ObjectMapper objectMapper;
    private final Map<String, CellFormatter> formatters;
    private final CellFormatter textFallback;

    public TableRenderingService(ObjectMapper objectMapper, List<CellFormatter> formatters) {
        this.objectMapper = objectMapper;
        this.formatters = new LinkedHashMap<>();
        CellFormatter text = new TextCellFormatter();
        for (CellFormatter formatter : formatters) {
            this.formatters.put(formatter.type().toLowerCase(Locale.ROOT), formatter);
            if ("text".equals(formatter.type())) {
                text = formatter;
            }
        }
        this.textFallback = text;
    }

    public String render(String html, String tablesSchemaJson, Map<String, Object> data) {
        if (html == null || html.isBlank()) {
            return html == null ? "" : html;
        }
        List<TableSchema> schemas = parseSchemas(tablesSchemaJson);
        Map<String, Object> safeData = data != null ? data : Map.of();

        Matcher matcher = TABLE_PLACEHOLDER.matcher(html);
        StringBuffer result = new StringBuffer();
        while (matcher.find()) {
            String tableId = matcher.group(1);
            TableSchema schema = schemas.stream()
                    .filter(item -> tableId.equals(item.getId()))
                    .findFirst()
                    .orElse(null);
            String replacement = schema == null ? "" : renderTable(schema, safeData);
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    public List<TableSchema> parseSchemas(String tablesSchemaJson) {
        if (tablesSchemaJson == null || tablesSchemaJson.isBlank()) {
            return List.of();
        }
        try {
            List<TableSchema> schemas = objectMapper.readValue(
                    tablesSchemaJson, new TypeReference<List<TableSchema>>() {});
            return schemas != null ? schemas : List.of();
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Schéma de tableaux JSON invalide", ex);
        }
    }

    public String serializeSchemas(List<TableSchema> tables) {
        try {
            return objectMapper.writeValueAsString(tables != null ? tables : List.of());
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Impossible de sérialiser le schéma de tableaux", ex);
        }
    }

    private String renderTable(TableSchema schema, Map<String, Object> data) {
        List<ColumnDefinition> columns =
                schema.getColumns() != null ? schema.getColumns() : List.of();
        StringBuilder html = new StringBuilder();
        html.append("<table class=\"tpl-table\" data-table=\"")
                .append(TextCellFormatter.escapeHtml(nullToEmpty(schema.getId())))
                .append("\">");
        html.append("<thead><tr>");
        for (ColumnDefinition column : columns) {
            html.append("<th>")
                    .append(TextCellFormatter.escapeHtml(nullToEmpty(column.getLabel())))
                    .append("</th>");
        }
        html.append("</tr></thead><tbody>");

        List<Map<String, Object>> rows = extractRows(data, schema.getDataKey());
        for (Map<String, Object> row : rows) {
            html.append("<tr>");
            for (ColumnDefinition column : columns) {
                Object raw = getNestedValue(row, column.getKey());
                String formatted = resolveFormatter(column.getType()).format(raw, column);
                html.append("<td>").append(formatted).append("</td>");
            }
            html.append("</tr>");
        }
        html.append("</tbody></table>");
        return html.toString();
    }

    private CellFormatter resolveFormatter(String type) {
        if (type == null || type.isBlank()) {
            return textFallback;
        }
        return formatters.getOrDefault(type.toLowerCase(Locale.ROOT), textFallback);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractRows(Map<String, Object> data, String dataKey) {
        Object value = getNestedValue(data, dataKey);
        if (!(value instanceof List<?> list)) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                rows.add((Map<String, Object>) map);
            }
        }
        return rows;
    }

    @SuppressWarnings("unchecked")
    Object getNestedValue(Map<String, Object> data, String path) {
        if (data == null || path == null || path.isBlank()) {
            return null;
        }
        Object current = data;
        for (String segment : path.split("\\.")) {
            if (!(current instanceof Map<?, ?> map)) {
                return null;
            }
            current = ((Map<String, Object>) map).get(segment);
            if (current == null) {
                return null;
            }
        }
        return current;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
