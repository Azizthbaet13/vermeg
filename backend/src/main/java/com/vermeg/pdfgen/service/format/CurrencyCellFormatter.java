package com.vermeg.pdfgen.service.format;

import java.text.NumberFormat;
import java.util.Locale;

import org.springframework.stereotype.Component;

import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;

@Component
public class CurrencyCellFormatter implements CellFormatter {

    @Override
    public String type() {
        return "currency";
    }

    @Override
    public String format(Object value, ColumnDefinition column) {
        Double number = NumberCellFormatter.toDouble(value);
        if (number == null) {
            return value == null ? "" : TextCellFormatter.escapeHtml(String.valueOf(value));
        }
        NumberFormat format = NumberFormat.getNumberInstance(Locale.FRANCE);
        format.setMinimumFractionDigits(3);
        format.setMaximumFractionDigits(3);
        String code = column != null && column.getCurrencyCode() != null && !column.getCurrencyCode().isBlank()
                ? column.getCurrencyCode()
                : "TND";
        return TextCellFormatter.escapeHtml(format.format(number) + " " + code);
    }
}
