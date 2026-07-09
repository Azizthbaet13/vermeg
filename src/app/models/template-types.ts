export type ColumnType = 'text' | 'number' | 'currency' | 'date' | 'percentage' | 'boolean';

export interface TableColumnSchema {
  key: string;
  label: string;
  type: ColumnType;
  currencyCode?: string;
}

export interface TableSchema {
  id: string;
  dataKey: string;
  columns: TableColumnSchema[];
}

export interface TemplateParts {
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
  headerCss: string;
  bodyCss: string;
  footerCss: string;
  tables: TableSchema[];
}

export interface TemplateExportPayload {
  version: 2;
  parts: TemplateParts;
}

export const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'currency', label: 'Devise' },
  { value: 'date', label: 'Date' },
  { value: 'percentage', label: 'Pourcentage' },
  { value: 'boolean', label: 'Booléen' },
];
