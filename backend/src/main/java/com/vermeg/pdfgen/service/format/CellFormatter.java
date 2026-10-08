package com.vermeg.pdfgen.service.format;

import com.vermeg.pdfgen.model.TableSchema.ColumnDefinition;

public interface CellFormatter {

    String type();

    String format(Object value, ColumnDefinition column);
}
