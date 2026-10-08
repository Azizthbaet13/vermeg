package com.vermeg.pdfgen.service.format;

import org.springframework.stereotype.Component;

import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;

@Component
public class BooleanCellFormatter implements CellFormatter {

    @Override
    public String type() {
        return "boolean";
    }

    @Override
    public String format(Object value, ColumnDefinition column) {
        if (value == null) {
            return "";
        }
        boolean truthy = value instanceof Boolean bool
                ? bool
                : "true".equalsIgnoreCase(String.valueOf(value))
                        || "1".equals(String.valueOf(value))
                        || "oui".equalsIgnoreCase(String.valueOf(value));
        return truthy ? "Oui" : "Non";
    }
}
