package com.vermeg.pdfgen.service.format;

import java.text.NumberFormat;
import java.util.Locale;

import org.springframework.stereotype.Component;

import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;

@Component
public class NumberCellFormatter implements CellFormatter {

    @Override
    public String type() {
        return "number";
    }

    @Override
    public String format(Object value, ColumnDefinition column) {
        Double number = toDouble(value);
        if (number == null) {
            return value == null ? "" : TextCellFormatter.escapeHtml(String.valueOf(value));
        }
        NumberFormat format = NumberFormat.getNumberInstance(Locale.FRANCE);
        format.setMaximumFractionDigits(2);
        return TextCellFormatter.escapeHtml(format.format(number));
    }

    static Double toDouble(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value).trim().replace(",", "."));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
