package com.vermeg.pdfgen.service.format;

import org.springframework.stereotype.Component;

import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;

@Component
public class TextCellFormatter implements CellFormatter {

    @Override
    public String type() {
        return "text";
    }

    @Override
    public String format(Object value, ColumnDefinition column) {
        if (value == null) {
            return "";
        }
        return escapeHtml(String.valueOf(value));
    }

    public static String escapeHtml(String input) {
        return input
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
