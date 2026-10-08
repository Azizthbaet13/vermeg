import { describe, expect, it } from 'vitest';
import type { TableSchema } from '../models/template-types';
import { TemplateEngineService } from './template-engine.service';

describe('TemplateEngineService', () => {
  const service = new TemplateEngineService();

  const articlesTable: TableSchema = {
    id: 'articles',
    dataKey: 'articles',
    columns: [
      { key: 'label', label: 'Article', type: 'text' },
      { key: 'price', label: 'Prix', type: 'currency', currencyCode: 'TND' },
      { key: 'deliveryDate', label: 'Date', type: 'date' },
      { key: 'discount', label: 'Remise', type: 'percentage' },
      { key: 'paid', label: 'Payé', type: 'boolean' },
    ],
  };

  it('formats column types on table render', () => {
    const html = service.substitute(
      '{{table:articles}}',
      {
        articles: [
          {
            label: 'Support',
            price: 250,
            deliveryDate: '2027-07-15',
            discount: 10,
            paid: false,
          },
        ],
      },
      [articlesTable],
    );

    expect(html).toContain('Support');
    expect(html).toContain('250,00');
    expect(html).toContain('TND');
    expect(html).toContain('15/07/2027');
    expect(html).toContain('10 %');
    expect(html).toContain('❌ Non');
  });

  it('formats boolean true values', () => {
    expect(service.formatValue(true, 'boolean')).toBe('✅ Oui');
    expect(service.formatValue(false, 'boolean')).toBe('❌ Non');
  });

  it('infers column types from sample rows', () => {
    const columns = service.inferColumnsFromSampleRows([
      {
        label: 'Support',
        unitPrice: 250,
        deliveryDate: '2027-07-15',
        discount: 10,
        paid: false,
      },
    ]);

    expect(columns.find((c) => c.key === 'unitPrice')?.type).toBe('currency');
    expect(columns.find((c) => c.key === 'deliveryDate')?.type).toBe('date');
    expect(columns.find((c) => c.key === 'discount')?.type).toBe('percentage');
    expect(columns.find((c) => c.key === 'paid')?.type).toBe('boolean');
  });

  it('replaces table placeholders when renaming table id', () => {
    const html = service.replaceTablePlaceholder(
      '<p>{{table:articles}}</p>',
      'articles',
      'lignes',
    );
    expect(html).toContain('{{table:lignes}}');
  });
});
