import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CKEditorModule, type ChangeEvent } from '@ckeditor/ckeditor5-angular';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { ClassicEditor as ClassicEditorType } from 'ckeditor5';
import {
  COLUMN_TYPES,
  type ColumnType,
  type TableColumnSchema,
  type TableSchema,
  type TemplateParts,
} from '../models/template-types';
import { TemplateEngineService } from '../services/template-engine.service';
import { ClassicEditor, ckEditorConfig } from './ckeditor.config';

type TemplateZone = 'header' | 'body' | 'footer';

const DEFAULT_ARTICLES_TABLE: TableSchema = {
  id: 'articles',
  dataKey: 'articles',
  columns: [
    { key: 'label', label: 'Article', type: 'text' },
    { key: 'quantity', label: 'Qté', type: 'number' },
    { key: 'unitPrice', label: 'Prix unitaire', type: 'currency', currencyCode: 'TND' },
    { key: 'discount', label: 'Remise', type: 'percentage' },
    { key: 'deliveryDate', label: 'Livraison', type: 'date' },
    { key: 'paid', label: 'Payé', type: 'boolean' },
    { key: 'total', label: 'Total', type: 'currency', currencyCode: 'TND' },
  ],
};

const DEFAULT_TEMPLATE_PARTS: TemplateParts = {
  headerHtml: `<div class="header">
  <div class="brand">Facture</div>
  <div class="meta">
    <div class="invoice-number">{{invoiceNumber}}</div>
    <div class="date">{{date}}</div>
  </div>
</div>`,
  bodyHtml: `<div class="bill-to">
  <div class="label">Facturé à</div>
  <div class="name">{{clientName}}</div>
  <div class="company">{{company}}</div>
</div>

<hr />

<h3>Articles</h3>
{{table:articles}}

<div class="total">
  <span>Total général</span>
  <strong>{{amount}}</strong>
</div>`,
  footerHtml: `<div class="footer">
  <span>Merci pour votre confiance.</span>
</div>`,
  headerCss: `.tpl-header .header{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:16px;
}
.tpl-header .brand{
  font-size:28px;
  font-weight:800;
  letter-spacing:-0.02em;
}
.tpl-header .meta{
  text-align:right;
  font-size:13px;
  color:#6b7280;
}
.tpl-header .invoice-number{
  font-weight:700;
  color:#111827;
}`,
  bodyCss: `.tpl-body{
  padding-top:16px;
}
.tpl-body .bill-to .label{
  font-size:11px;
  letter-spacing:0.08em;
  text-transform:uppercase;
  color:#9ca3af;
}
.tpl-body .bill-to .name{
  font-weight:700;
}
.tpl-body .bill-to .company{
  color:#6b7280;
}
.tpl-body hr{
  border:none;
  border-top:1px solid #e5e7eb;
  margin:16px 0;
}
.tpl-body .tpl-table{
  width:100%;
  border-collapse:collapse;
  margin:12px 0 18px;
  font-size:13px;
}
.tpl-body .tpl-table th,
.tpl-body .tpl-table td{
  border:1px solid #e5e7eb;
  padding:8px 10px;
  text-align:left;
}
.tpl-body .tpl-table th{
  background:#f9fafb;
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:0.05em;
  color:#6b7280;
}
.tpl-body .tpl-table td.cell-filled{
  background:#f0fdf4;
}
.tpl-body .tpl-table td.cell-missing{
  background:#fef2f2;
  color:#991b1b;
}
.tpl-body .total{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-top:18px;
  padding:10px 12px;
  border:1px solid #e5e7eb;
  border-radius:10px;
  background:#fafafa;
}`,
  footerCss: `.tpl-footer{
  margin-top:18px;
  padding-top:12px;
  border-top:1px solid #e5e7eb;
  font-size:12px;
  color:#9ca3af;
  text-align:center;
}`,
  tables: [DEFAULT_ARTICLES_TABLE],
};

const DEFAULT_JSON = `{
  "clientName": "Mohamed Ben Ali",
  "company": "Vermeg Tunisia",
  "invoiceNumber": "FAC-0001",
  "date": "6 juillet 2026",
  "amount": 1250,
  "articles": [
    {
      "label": "Développement Angular",
      "quantity": 5,
      "unitPrice": 250,
      "discount": 10,
      "deliveryDate": "2027-07-15",
      "paid": false,
      "total": 1125
    },
    {
      "label": "Support technique",
      "quantity": 1,
      "unitPrice": 125,
      "discount": 0,
      "deliveryDate": "2027-06-01",
      "paid": true,
      "total": 125
    }
  ]
}`;

@Component({
  selector: 'app-template-editor',
  imports: [FormsModule, CKEditorModule],
  templateUrl: './template-editor.component.html',
  styleUrl: './template-editor.component.css',
})
export class TemplateEditorComponent {
  private readonly templateEngine = inject(TemplateEngineService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly previewRef = viewChild<ElementRef<HTMLElement>>('preview');
  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly Editor = ClassicEditor;
  protected readonly editorConfig = ckEditorConfig;
  protected readonly columnTypes = COLUMN_TYPES;

  protected readonly parts = signal<TemplateParts>(structuredClone(DEFAULT_TEMPLATE_PARTS));
  protected readonly activeZone = signal<TemplateZone>('body');
  protected readonly activeTableId = signal(DEFAULT_ARTICLES_TABLE.id);
  protected readonly jsonInput = signal(DEFAULT_JSON);
  protected readonly isGenerating = signal(false);
  private editorInstance: ClassicEditorType | null = null;

  protected readonly jsonError = computed(() =>
    this.templateEngine.parseJson(this.jsonInput()).error,
  );

  protected readonly parsedData = computed(
    () => this.templateEngine.parseJson(this.jsonInput()).data ?? {},
  );

  protected readonly activeTable = computed(() =>
    this.parts().tables.find((t) => t.id === this.activeTableId()) ?? this.parts().tables[0],
  );

  protected readonly assembledHtml = computed(() => {
    const p = this.parts();
    return `
<style>
${p.headerCss}
${p.bodyCss}
${p.footerCss}
</style>
<div class="tpl-root">
  <div class="tpl-header">${p.headerHtml}</div>
  <div class="tpl-body">${p.bodyHtml}</div>
  <div class="tpl-footer">${p.footerHtml}</div>
</div>`;
  });

  protected readonly detectedVariables = computed(() =>
    this.templateEngine.extractVariables(this.assembledHtml()),
  );

  protected readonly renderedHtml = computed((): SafeHtml => {
    const html = this.templateEngine.substitute(
      this.assembledHtml(),
      this.parsedData(),
      this.parts().tables,
    );
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  protected formatVariable(name: string): string {
    return `{{${name}}}`;
  }

  protected formatTablePlaceholder(tableId: string): string {
    return `{{table:${tableId}}}`;
  }

  protected onEditorReady(editor: ClassicEditorType): void {
    this.editorInstance = editor;
    this.editorInstance.setData(this.getZoneHtml(this.activeZone()));
  }

  protected onTemplateChange(event: ChangeEvent<ClassicEditorType>): void {
    const zone = this.activeZone();
    const html = event.editor.getData();
    this.parts.update((p) => {
      const next = { ...p };
      if (zone === 'header') next.headerHtml = html;
      if (zone === 'body') next.bodyHtml = html;
      if (zone === 'footer') next.footerHtml = html;
      return next;
    });
  }

  protected setActiveZone(zone: TemplateZone): void {
    this.activeZone.set(zone);
    this.editorInstance?.setData(this.getZoneHtml(zone));
  }

  protected setActiveTable(tableId: string): void {
    this.activeTableId.set(tableId);
  }

  protected getZoneCss(zone: TemplateZone): string {
    const p = this.parts();
    if (zone === 'header') return p.headerCss;
    if (zone === 'footer') return p.footerCss;
    return p.bodyCss;
  }

  protected setZoneCss(zone: TemplateZone, value: string): void {
    this.parts.update((p) => {
      const next = { ...p };
      if (zone === 'header') next.headerCss = value;
      if (zone === 'body') next.bodyCss = value;
      if (zone === 'footer') next.footerCss = value;
      return next;
    });
  }

  protected updateTableField(
    tableId: string,
    field: 'id' | 'dataKey',
    value: string,
  ): void {
    this.parts.update((p) => ({
      ...p,
      tables: p.tables.map((t) => (t.id === tableId ? { ...t, [field]: value } : t)),
    }));
    if (field === 'id') {
      this.activeTableId.set(value);
    }
  }

  protected updateColumn(
    tableId: string,
    index: number,
    patch: Partial<TableColumnSchema>,
  ): void {
    this.parts.update((p) => ({
      ...p,
      tables: p.tables.map((t) => {
        if (t.id !== tableId) return t;
        const columns = [...t.columns];
        columns[index] = { ...columns[index], ...patch };
        return { ...t, columns };
      }),
    }));
  }

  protected addColumn(tableId: string): void {
    this.parts.update((p) => ({
      ...p,
      tables: p.tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              columns: [
                ...t.columns,
                { key: 'nouvelleColonne', label: 'Nouvelle colonne', type: 'text' as ColumnType },
              ],
            }
          : t,
      ),
    }));
  }

  protected removeColumn(tableId: string, index: number): void {
    this.parts.update((p) => ({
      ...p,
      tables: p.tables.map((t) =>
        t.id === tableId
          ? { ...t, columns: t.columns.filter((_, i) => i !== index) }
          : t,
      ),
    }));
  }

  protected addTable(): void {
    const id = `tableau${this.parts().tables.length + 1}`;
    this.parts.update((p) => ({
      ...p,
      tables: [
        ...p.tables,
        {
          id,
          dataKey: id,
          columns: [{ key: 'label', label: 'Libellé', type: 'text' }],
        },
      ],
    }));
    this.activeTableId.set(id);
  }

  protected insertTablePlaceholder(tableId: string): void {
    const placeholder = this.formatTablePlaceholder(tableId);
    if (this.activeZone() !== 'body') {
      this.setActiveZone('body');
    }
    this.parts.update((p) => ({
      ...p,
      bodyHtml: p.bodyHtml.includes(placeholder) ? p.bodyHtml : `${p.bodyHtml}\n<p>${placeholder}</p>`,
    }));
    this.editorInstance?.setData(this.parts().bodyHtml);
  }

  private getZoneHtml(zone: TemplateZone): string {
    const p = this.parts();
    if (zone === 'header') return p.headerHtml;
    if (zone === 'footer') return p.footerHtml;
    return p.bodyHtml;
  }

  private setParts(next: TemplateParts): void {
    this.parts.set(next);
    this.activeTableId.set(next.tables[0]?.id ?? '');
    this.editorInstance?.setData(this.getZoneHtml(this.activeZone()));
  }

  protected triggerImport(): void {
    this.fileInputRef()?.nativeElement.click();
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      this.parts.update((p) => ({ ...p, bodyHtml: content }));
      if (this.activeZone() === 'body') {
        this.editorInstance?.setData(content);
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  protected exportTemplate(): void {
    const blob = new Blob([this.assembledHtml()], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template-assemble.html';
    link.click();
    URL.revokeObjectURL(url);
  }

  protected exportTemplateParts(): void {
    const payload = {
      version: 2 as const,
      parts: this.parts(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template-parts.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  protected importTemplateParts(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result ?? '')) as {
          version?: number;
          parts?: Partial<TemplateParts>;
        };
        const parts = raw.parts ?? {};
        const next: TemplateParts = {
          headerHtml: parts.headerHtml ?? DEFAULT_TEMPLATE_PARTS.headerHtml,
          bodyHtml: parts.bodyHtml ?? DEFAULT_TEMPLATE_PARTS.bodyHtml,
          footerHtml: parts.footerHtml ?? DEFAULT_TEMPLATE_PARTS.footerHtml,
          headerCss: parts.headerCss ?? DEFAULT_TEMPLATE_PARTS.headerCss,
          bodyCss: parts.bodyCss ?? DEFAULT_TEMPLATE_PARTS.bodyCss,
          footerCss: parts.footerCss ?? DEFAULT_TEMPLATE_PARTS.footerCss,
          tables: parts.tables ?? DEFAULT_TEMPLATE_PARTS.tables,
        };
        this.setParts(next);
      } catch {
        // ignore malformed file
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  protected loadSampleJson(): void {
    this.jsonInput.set(DEFAULT_JSON);
  }

  protected async generatePdf(): Promise<void> {
    const preview = this.previewRef()?.nativeElement;
    if (!preview || this.isGenerating() || this.jsonError()) return;

    this.isGenerating.set(true);
    try {
      const canvas = await html2canvas(preview, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * maxWidth) / canvas.width;

      pdf.addImage(
        imgData,
        'PNG',
        margin,
        margin,
        maxWidth,
        Math.min(imgHeight, pageHeight - margin * 2),
      );

      const data = this.parsedData();
      const fileName =
        typeof data['invoiceNumber'] === 'string' ? data['invoiceNumber'] : 'document';
      pdf.save(`${fileName}.pdf`);
    } finally {
      this.isGenerating.set(false);
    }
  }

  protected reset(): void {
    this.setParts(structuredClone(DEFAULT_TEMPLATE_PARTS));
    this.jsonInput.set(DEFAULT_JSON);
  }
}
