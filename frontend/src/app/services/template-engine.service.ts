import { Injectable } from '@angular/core';
import type { ColumnType, TableColumnSchema, TableSchema } from '../models/template-types';
import { renderVelocity } from './velocity-engine';

export interface FormatOptions {
  currencyCode?: string;
  locale?: string;
}

@Injectable({ providedIn: 'root' })
export class TemplateEngineService {
  substitute(
    template: string,
    data: Record<string, unknown>,
    tables: TableSchema[] = [],
  ): string {
    let result = renderVelocity(template, data);
    result = this.renderTables(result, data, tables);
    result = this.substituteScalars(result, data);
    return result;
  }

  extractVariables(template: string): string[] {
    const found = new Set<string>();
    for (const match of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
      found.add(match[1]);
    }
    for (const match of template.matchAll(/\{\{\s*table:([\w-]+)\s*\}\}/g)) {
      found.add(`table:${match[1]}`);
    }
    return [...found];
  }

  parseJson(input: string): { data: Record<string, unknown> | null; error: string | null } {
    const trimmed = input.trim();
    if (!trimmed) {
      return { data: {}, error: null };
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { data: null, error: 'Le JSON doit être un objet (ex: { "cle": "valeur" }).' };
      }
      return { data: parsed as Record<string, unknown>, error: null };
    } catch {
      return { data: null, error: 'JSON invalide — vérifiez la syntaxe (guillemets, virgules).' };
    }
  }

  formatValue(value: unknown, type: ColumnType, options: FormatOptions = {}): string {
    if (value === undefined || value === null || value === '') {
      return '—';
    }

    const locale = options.locale ?? 'fr-FR';

    switch (type) {
      case 'text':
        return String(value);

      case 'number': {
        const num = this.toNumber(value);
        if (num === null) return String(value);
        return new Intl.NumberFormat(locale, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(num);
      }

      case 'currency': {
        const num = this.toNumber(value);
        if (num === null) return String(value);
        const currency = options.currencyCode ?? 'TND';
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(num);
      }

      case 'date':
        return this.formatDate(value, locale);

      case 'percentage': {
        const num = this.toNumber(value);
        if (num === null) return String(value);
        return `${new Intl.NumberFormat(locale, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(num)} %`;
      }

      case 'boolean':
        return this.formatBoolean(value);

      default:
        return String(value);
    }
  }

  private renderTables(
    template: string,
    data: Record<string, unknown>,
    tables: TableSchema[],
  ): string {
    return template.replace(/\{\{\s*table:([\w-]+)\s*\}\}/g, (_, tableId: string) => {
      const schema = tables.find((t) => t.id === tableId);
      if (!schema) {
        return `<div class="table-missing">Tableau introuvable : ${this.escapeHtml(tableId)}</div>`;
      }
      return this.renderTable(schema, data);
    });
  }

  private renderTable(schema: TableSchema, data: Record<string, unknown>): string {
    const rows = this.getNestedValue(data, schema.dataKey);
    if (!Array.isArray(rows)) {
      return `<div class="table-missing">Données manquantes pour <code>${this.escapeHtml(schema.dataKey)}</code></div>`;
    }

    const header = schema.columns
      .map((col) => `<th>${this.escapeHtml(col.label)}</th>`)
      .join('');

    const body = rows
      .map((row) => {
        if (typeof row !== 'object' || row === null) {
          return '';
        }
        const record = row as Record<string, unknown>;
        const cells = schema.columns
          .map((col) => {
            const raw = record[col.key];
            const formatted = this.formatValue(raw, col.type, {
              currencyCode: col.currencyCode,
            });
            const cssClass = raw === undefined || raw === null ? 'cell-missing' : 'cell-filled';
            return `<td class="${cssClass}">${this.escapeHtml(formatted)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    return `<table class="tpl-table" data-table="${this.escapeHtml(schema.id)}">
  <thead><tr>${header}</tr></thead>
  <tbody>${body || '<tr><td colspan="' + schema.columns.length + '">Aucune ligne</td></tr>'}</tbody>
</table>`;
  }

  private substituteScalars(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      const value = this.getNestedValue(data, key);
      if (value === undefined || value === null) {
        return `<span class="var-missing">{{${key}}}</span>`;
      }
      if (typeof value === 'object') {
        return `<span class="var-filled">${this.escapeHtml(JSON.stringify(value))}</span>`;
      }
      return `<span class="var-filled">${this.escapeHtml(String(value))}</span>`;
    });
  }

  private formatDate(value: unknown, locale: string): string {
    if (typeof value === 'string') {
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      if (isoMatch) {
        const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString(locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
        }
      }
    }

    const date = value instanceof Date ? value : new Date(String(value));
    if (isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private formatBoolean(value: unknown): string {
    const truthy =
      value === true ||
      value === 'true' ||
      value === 1 ||
      value === '1' ||
      value === 'oui' ||
      value === 'Oui';
    return truthy ? '✅ Oui' : '❌ Non';
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value.replace(',', '.'));
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  getNestedValue(data: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      return (current as Record<string, unknown>)[key];
    }, data);
  }

  /** Chemins JSON pointant vers des tableaux d'objets. */
  findArrayPaths(data: Record<string, unknown>, prefix = ''): string[] {
    const paths: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value)) {
        if (value.length === 0 || typeof value[0] === 'object') {
          paths.push(path);
        }
        continue;
      }

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        paths.push(...this.findArrayPaths(value as Record<string, unknown>, path));
      }
    }

    return paths;
  }

  inferColumnsFromSampleRows(
    rows: unknown[],
    defaultCurrency = 'TND',
  ): TableColumnSchema[] {
    const sample = rows.find((row) => row !== null && typeof row === 'object') as
      | Record<string, unknown>
      | undefined;

    if (!sample) {
      return [{ key: 'label', label: 'Libellé', type: 'text' }];
    }

    return Object.entries(sample).map(([key, value]) => {
      const type = this.inferColumnType(key, value);
      return {
        key,
        label: this.humanizeColumnKey(key),
        type,
        ...(type === 'currency' ? { currencyCode: defaultCurrency } : {}),
      };
    });
  }

  inferColumnType(key: string, value: unknown): ColumnType {
    const normalizedKey = key.toLowerCase();

    if (typeof value === 'boolean') {
      return 'boolean';
    }

    if (
      typeof value === 'string' &&
      (/^\d{4}-\d{2}-\d{2}/.test(value) || /date/i.test(normalizedKey))
    ) {
      return 'date';
    }

    if (
      /(price|amount|total|cost|montant|prix|tarif)/i.test(normalizedKey) &&
      typeof value === 'number'
    ) {
      return 'currency';
    }

    if (
      /(discount|percent|percentage|rate|remise|taux)/i.test(normalizedKey) &&
      typeof value === 'number'
    ) {
      return 'percentage';
    }

    if (typeof value === 'number') {
      return 'number';
    }

    return 'text';
  }

  replaceTablePlaceholder(html: string, oldId: string, newId: string): string {
    if (!oldId || !newId || oldId === newId) {
      return html;
    }

    const pattern = new RegExp(`\\{\\{\\s*table:${this.escapeRegExp(oldId)}\\s*\\}\\}`, 'g');
    return html.replace(pattern, `{{table:${newId}}}`);
  }

  private humanizeColumnKey(key: string): string {
    const spaced = key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
