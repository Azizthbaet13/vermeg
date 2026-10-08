package com.vermeg.pdfgen.service.format;

import org.springframework.stereotype.Component;

import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;

@Component
public class PercentageCellFormatter implements CellFormatter {

    @Override
    public String type() {
        return "percentage";
    }

    @Override
    public String format(Object value, ColumnDefinition column) {
        Double number = NumberCellFormatter.toDouble(value);
        if (number == null) {
            return value == null ? "" : TextCellFormatter.escapeHtml(String.valueOf(value));
        }
        return TextCellFormatter.escapeHtml(
                new NumberCellFormatter().format(number, column) + " %");
    }
}
