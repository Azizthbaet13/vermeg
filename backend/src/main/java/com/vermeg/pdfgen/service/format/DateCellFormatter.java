package com.vermeg.pdfgen.service.format;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

import org.springframework.stereotype.Component;

import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;

@Component
public class DateCellFormatter implements CellFormatter {

    private static final DateTimeFormatter OUTPUT = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    @Override
    public String type() {
        return "date";
    }

    @Override
    public String format(Object value, ColumnDefinition column) {
        if (value == null) {
            return "";
        }
        LocalDate date = parse(value);
        if (date == null) {
            return TextCellFormatter.escapeHtml(String.valueOf(value));
        }
        return TextCellFormatter.escapeHtml(OUTPUT.format(date));
    }

    private LocalDate parse(Object value) {
        if (value instanceof LocalDate localDate) {
            return localDate;
        }
        String raw = String.valueOf(value).trim();
        if (raw.isEmpty()) {
            return null;
        }
        try {
            if (raw.length() >= 10 && raw.charAt(4) == '-') {
                return LocalDate.parse(raw.substring(0, 10));
            }
            if (raw.contains("T")) {
                return LocalDateTime.parse(raw).toLocalDate();
            }
            return LocalDate.parse(raw);
        } catch (DateTimeParseException ex) {
            return null;
        }
    }
}
