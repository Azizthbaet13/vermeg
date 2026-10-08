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
import type { ClassicEditor as ClassicEditorType } from 'ckeditor5';
import {
  COLUMN_TYPES,
  type ColumnType,
  type TableColumnSchema,
  type TableSchema,
  type TemplateApiPayload,
  type TemplateApiRecord,
  type TemplateParts,
} from '../models/template-types';
import { TemplateApiService } from '../services/template-api.service';
import { TemplateEngineService } from '../services/template-engine.service';
import { parseZonedTemplate, type ParsedZoneParts } from '../services/zone-template-parser';
import { prepareVelocityHtml } from '../services/velocity-engine';
import { PAGE_BREAK_STYLES } from '../utils/pdf-export.util';
import { ClassicEditor, ckEditorConfig } from './ckeditor.config';
import {
  GitImportModalComponent,
  type GitImportResult,
} from './git-import-modal.component';
import { GitCommitModalComponent } from './git-commit-modal.component';

type TemplateZone = 'header' | 'body' | 'footer';
type DetectedFieldType = 'variable' | 'table';

const DRAG_TOKEN_MIME = 'application/x-vermeg-token';

interface DetectedField {
  key: string;
  token: string;
  type: DetectedFieldType;
}

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
  imports: [FormsModule, CKEditorModule, GitImportModalComponent, GitCommitModalComponent],
  templateUrl: './template-editor.component.html',
  styleUrl: './template-editor.component.css',
})
export class TemplateEditorComponent {
  private readonly templateEngine = inject(TemplateEngineService);
  private readonly templateApi = inject(TemplateApiService);
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
  protected readonly gitModalOpen = signal(false);
  protected readonly gitCommitModalOpen = signal(false);
  protected readonly gitCommitContent = signal('');
  protected readonly importStatus = signal<string | null>(null);
  protected readonly statusKind = signal<'success' | 'error' | null>(null);
  protected readonly templateName = signal('Facture');
  protected readonly savedTemplateId = signal<number | null>(null);
  protected readonly savedTemplates = signal<TemplateApiRecord[]>([]);
  protected readonly isSaving = signal(false);
  private editorInstance: ClassicEditorType | null = null;

  constructor() {
    void this.refreshSavedTemplates();
  }

  protected readonly jsonError = computed(() =>
    this.templateEngine.parseJson(this.jsonInput()).error,
  );

  protected readonly parsedData = computed(
    () => this.templateEngine.parseJson(this.jsonInput()).data ?? {},
  );

  protected readonly detectedFields = computed<DetectedField[]>(() => {
    const result: DetectedField[] = [];
    this.collectDetectedFields('', this.parsedData(), result);
    return result;
  });

  protected readonly activeTable = computed(() =>
    this.parts().tables.find((t) => t.id === this.activeTableId()) ?? this.parts().tables[0],
  );

  protected readonly jsonArrayKeys = computed(() =>
    this.templateEngine.findArrayPaths(this.parsedData()),
  );

  protected readonly tableConfigStatus = computed(() => {
    const placeholders = [
      ...this.assembledHtml().matchAll(/\{\{\s*table:([\w-]+)\s*\}\}/g),
    ].map((match) => match[1]);
    const configuredIds = new Set(this.parts().tables.map((t) => t.id));
    const missing = [...new Set(placeholders.filter((id) => !configuredIds.has(id)))];
    return { placeholders, missing };
  });

  private tableIdBeforeEdit: string | null = null;
  protected readonly tableIdDrafts = signal<Record<string, string>>({});

  protected readonly assembledHtml = computed(() => {
    const p = this.parts();
    return `
<style>
${PAGE_BREAK_STYLES}
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
    this.attachExternalDropHandlers(editor);
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

  protected onFieldDragStart(event: DragEvent, token: string): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(DRAG_TOKEN_MIME, token);
    event.dataTransfer.effectAllowed = 'copy';
  }

  protected insertFieldToken(token: string): void {
    const tableMatch = /^\{\{table:([\w-]+)\}\}$/.exec(token);
    if (tableMatch) {
      token = this.formatTablePlaceholder(this.ensureTableForReference(tableMatch[1]));
    }

    if (this.editorInstance) {
      this.insertTokenAtCursor(token);
      return;
    }

    this.appendPlaceholderToActiveZone(token);
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

  protected tableIdValue(table: TableSchema): string {
    return this.tableIdDrafts()[table.id] ?? table.id;
  }

  protected onTableIdFocus(tableId: string): void {
    this.tableIdBeforeEdit = tableId;
  }

  protected onTableIdInput(tableId: string, value: string): void {
    this.tableIdDrafts.update((drafts) => ({ ...drafts, [tableId]: value }));
  }

  protected commitTableIdRename(tableId: string, rawValue: string): void {
    const oldId = this.tableIdBeforeEdit ?? tableId;
    this.tableIdBeforeEdit = null;

    this.tableIdDrafts.update((drafts) => {
      const next = { ...drafts };
      delete next[tableId];
      delete next[oldId];
      return next;
    });

    const newId = rawValue.trim();
    if (!newId || newId === oldId) {
      return;
    }

    if (this.parts().tables.some((t) => t.id === newId)) {
      return;
    }

    this.renameTableId(oldId, newId);
  }

  protected updateTableField(
    tableId: string,
    field: 'dataKey',
    value: string,
  ): void {
    this.parts.update((p) => ({
      ...p,
      tables: p.tables.map((t) => (t.id === tableId ? { ...t, [field]: value } : t)),
    }));
  }

  protected renameTableId(oldId: string, newId: string): void {
    if (!oldId || !newId || oldId === newId) {
      return;
    }

    this.parts.update((p) => ({
      ...p,
      headerHtml: this.templateEngine.replaceTablePlaceholder(p.headerHtml, oldId, newId),
      bodyHtml: this.templateEngine.replaceTablePlaceholder(p.bodyHtml, oldId, newId),
      footerHtml: this.templateEngine.replaceTablePlaceholder(p.footerHtml, oldId, newId),
      tables: p.tables.map((t) => (t.id === oldId ? { ...t, id: newId } : t)),
    }));

    if (this.activeTableId() === oldId) {
      this.activeTableId.set(newId);
    }

    this.editorInstance?.setData(this.getZoneHtml(this.activeZone()));
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
    const id = this.nextTableId();
    const dataKey = this.jsonArrayKeys().find((key) => !this.hasTableForDataKey(key)) ?? id;
    const rows = this.templateEngine.getNestedValue(this.parsedData(), dataKey);
    const columns = Array.isArray(rows)
      ? this.templateEngine.inferColumnsFromSampleRows(rows)
      : [{ key: 'label', label: 'Libellé', type: 'text' as ColumnType }];

    this.parts.update((p) => ({
      ...p,
      tables: [...p.tables, { id, dataKey, columns }],
    }));
    this.activeTableId.set(id);
  }

  protected removeTable(tableId: string): void {
    const tables = this.parts().tables.filter((t) => t.id !== tableId);
    if (tables.length === this.parts().tables.length) {
      return;
    }

    this.parts.update((p) => ({ ...p, tables }));
    this.activeTableId.set(tables[0]?.id ?? '');
  }

  protected syncColumnsFromJson(tableId: string): void {
    const table = this.parts().tables.find((t) => t.id === tableId);
    if (!table) {
      return;
    }

    const rows = this.templateEngine.getNestedValue(this.parsedData(), table.dataKey);
    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }

    const defaultCurrency =
      table.columns.find((col) => col.type === 'currency')?.currencyCode ?? 'TND';
    const columns = this.templateEngine.inferColumnsFromSampleRows(rows, defaultCurrency);

    this.parts.update((p) => ({
      ...p,
      tables: p.tables.map((t) => (t.id === tableId ? { ...t, columns } : t)),
    }));
  }

  protected insertTablePlaceholder(tableId: string): void {
    const placeholder = this.formatTablePlaceholder(tableId);

    if (this.editorInstance) {
      this.insertFieldToken(placeholder);
      return;
    }

    this.appendPlaceholderToActiveZone(placeholder);
  }

  protected ensureTableForReference(reference: string): string {
    const existing = this.parts().tables.find(
      (t) => t.id === reference || t.dataKey === reference,
    );
    if (existing) {
      return existing.id;
    }

    const id = this.uniqueTableId(reference);
    const rows = this.templateEngine.getNestedValue(this.parsedData(), reference);
    const columns = Array.isArray(rows)
      ? this.templateEngine.inferColumnsFromSampleRows(rows)
      : [{ key: 'label', label: 'Libellé', type: 'text' as ColumnType }];

    this.parts.update((p) => ({
      ...p,
      tables: [...p.tables, { id, dataKey: reference, columns }],
    }));

    return id;
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

  protected openGitModal(): void {
    this.gitModalOpen.set(true);
  }

  protected closeGitModal(): void {
    this.gitModalOpen.set(false);
  }

  protected onGitImported(result: GitImportResult): void {
    this.applyImportedContent(result.content, result.zones);
    this.gitModalOpen.set(false);
  }

  protected openGitCommitModal(): void {
    this.gitCommitContent.set(
      JSON.stringify({ version: 2 as const, parts: this.parts() }, null, 2),
    );
    this.gitCommitModalOpen.set(true);
  }

  protected closeGitCommitModal(): void {
    this.gitCommitModalOpen.set(false);
  }

  protected onGitCommitted(result: { path: string; branch: string; updated: boolean }): void {
    this.gitCommitModalOpen.set(false);
    const action = result.updated ? 'mis à jour' : 'créé';
    this.setStatus(
      `Template ${action} sur GitHub (${result.branch} : ${result.path}).`,
      'success',
    );
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      this.applyImportedContent(content, parseZonedTemplate(content));
      input.value = '';
    };
    reader.readAsText(file);
  }

  /**
   * Répartit le contenu importé dans header / body / footer (+ CSS).
   * Si le fichier n'est pas structuré, tout va dans le body.
   */
  private applyImportedContent(content: string, zones: ParsedZoneParts | null): void {
    if (zones) {
      this.parts.update((p) => ({
        ...p,
        headerHtml: prepareVelocityHtml(zones.headerHtml),
        bodyHtml: prepareVelocityHtml(zones.bodyHtml),
        footerHtml: prepareVelocityHtml(zones.footerHtml),
        headerCss: zones.headerCss,
        bodyCss: zones.bodyCss,
        footerCss: zones.footerCss,
        tables: zones.tables ?? p.tables,
      }));
      const startZone: TemplateZone =
        zones.headerHtml.trim() ? 'header' : zones.bodyHtml.trim() ? 'body' : 'footer';
      this.activeZone.set(startZone);
      this.editorInstance?.setData(this.getZoneHtml(startZone));
      this.setStatus(
        'Import réussi : HTML et CSS ont été extraits et répartis (Header / Body / Footer).',
      );
      return;
    }

    // Fichier HTML simple sans zones → body uniquement.
    this.parts.update((p) => ({ ...p, bodyHtml: prepareVelocityHtml(content) }));
    this.activeZone.set('body');
    this.editorInstance?.setData(content);
    this.setStatus(
      'Import simple : contenu chargé dans Body uniquement (pas de structure de zones détectée).',
    );
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

  protected async saveTemplate(): Promise<TemplateApiRecord | null> {
    const name = this.templateName().trim();
    if (!name) {
      this.setStatus('Le nom du template est obligatoire.', 'error');
      return null;
    }
    if (this.isSaving()) return null;

    this.isSaving.set(true);
    try {
      const existingId = this.savedTemplateId();
      const saved = existingId
        ? await this.templateApi.update(existingId, this.buildApiPayload(name))
        : await this.templateApi.create(this.buildApiPayload(name));
      this.savedTemplateId.set(saved.id);
      await this.refreshSavedTemplates();
      this.setStatus(
        existingId
          ? `Template #${saved.id} mis à jour en base.`
          : `Template #${saved.id} enregistré en base.`,
        'success',
      );
      return saved;
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : 'Échec de la sauvegarde.', 'error');
      return null;
    } finally {
      this.isSaving.set(false);
    }
  }

  protected async onSelectSavedTemplate(id: number | string | null): Promise<void> {
    if (id === null || id === '' || id === 'null') {
      return;
    }
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;

    try {
      const record = await this.templateApi.getById(numericId);
      this.applySavedRecord(record);
      this.setStatus(`Template « ${record.name} » chargé depuis la base.`, 'success');
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : 'Impossible de charger le template.', 'error');
    }
  }

  protected async generatePdf(): Promise<void> {
    if (this.isGenerating() || this.jsonError()) return;

    this.isGenerating.set(true);
    try {
      const saved = await this.saveTemplate();
      if (!saved) {
        return;
      }

      const data = this.parsedData();
      const renderedHtml = this.templateEngine.substitute(
        this.assembledHtml(),
        data,
        this.parts().tables,
      );
      const blob = await this.templateApi.generatePdf(saved.id, data, renderedHtml);
      const fileName =
        typeof data['invoiceNumber'] === 'string' ? data['invoiceNumber'] : saved.name || 'document';
      this.downloadBlob(blob, `${fileName}.pdf`);
      this.setStatus('PDF généré par le backend (Playwright / Chromium).', 'success');
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : 'Erreur lors de la génération PDF.', 'error');
    } finally {
      this.isGenerating.set(false);
    }
  }

  protected reset(): void {
    this.setParts(structuredClone(DEFAULT_TEMPLATE_PARTS));
    this.jsonInput.set(DEFAULT_JSON);
    this.templateName.set('Facture');
    this.savedTemplateId.set(null);
    this.setStatus(null);
  }

  private buildApiPayload(name: string): TemplateApiPayload {
    const parts = this.parts();
    return {
      name,
      headerHtml: parts.headerHtml,
      bodyHtml: parts.bodyHtml,
      footerHtml: parts.footerHtml,
      headerCss: parts.headerCss,
      bodyCss: parts.bodyCss,
      footerCss: parts.footerCss,
      tables: parts.tables,
    };
  }

  private applySavedRecord(record: TemplateApiRecord): void {
    this.templateName.set(record.name);
    this.savedTemplateId.set(record.id);
    this.setParts({
      headerHtml: record.headerHtml ?? '',
      bodyHtml: record.bodyHtml ?? '',
      footerHtml: record.footerHtml ?? '',
      headerCss: record.headerCss ?? '',
      bodyCss: record.bodyCss ?? '',
      footerCss: record.footerCss ?? '',
      tables: record.tables?.length ? record.tables : structuredClone(DEFAULT_TEMPLATE_PARTS.tables),
    });
  }

  private async refreshSavedTemplates(): Promise<void> {
    try {
      const page = await this.templateApi.list(0, 100);
      this.savedTemplates.set(page.content ?? []);
    } catch (err) {
      this.savedTemplates.set([]);
      const message =
        err instanceof Error
          ? err.message
          : 'Backend injoignable — lancez Spring Boot sur le port 8081.';
      this.setStatus(message, 'error');
    }
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
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

  private setStatus(message: string | null, kind: 'success' | 'error' | null = 'success'): void {
    this.importStatus.set(message);
    this.statusKind.set(message ? kind : null);
  }

  private collectDetectedFields(
    prefix: string,
    value: unknown,
    output: DetectedField[],
  ): void {
    if (Array.isArray(value)) {
      if (prefix) {
        const tableId = this.tableIdForDataKey(prefix);
        output.push({
          key: prefix,
          token: this.formatTablePlaceholder(tableId),
          type: 'table',
        });
      }
      return;
    }

    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const [key, nested] of Object.entries(record)) {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        this.collectDetectedFields(nextKey, nested, output);
      }
      return;
    }

    if (prefix) {
      output.push({
        key: prefix,
        token: this.formatVariable(prefix),
        type: 'variable',
      });
    }
  }

  private attachExternalDropHandlers(editor: ClassicEditorType): void {
    const editable = editor.ui.view.editable.element;
    if (!editable) return;

    editable.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes(DRAG_TOKEN_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });

    editable.addEventListener('drop', (event) => {
      if (!event.dataTransfer?.types.includes(DRAG_TOKEN_MIME)) return;
      const token = event.dataTransfer.getData(DRAG_TOKEN_MIME);
      if (!token) return;
      event.preventDefault();
      event.stopPropagation();
      this.insertFieldToken(token);
    });
  }

  private insertTokenAtCursor(token: string): void {
    if (!this.editorInstance) return;

    this.editorInstance.model.change((writer) => {
      const selection = this.editorInstance!.model.document.selection;
      this.editorInstance!.model.insertContent(writer.createText(token), selection);
    });

    this.syncCurrentZoneFromEditor();
  }

  private tableIdForDataKey(dataKey: string): string {
    return this.parts().tables.find((t) => t.dataKey === dataKey)?.id ?? dataKey;
  }

  private hasTableForDataKey(dataKey: string): boolean {
    return this.parts().tables.some((t) => t.dataKey === dataKey);
  }

  private nextTableId(): string {
    let index = this.parts().tables.length + 1;
    while (this.parts().tables.some((t) => t.id === `tableau${index}`)) {
      index += 1;
    }
    return `tableau${index}`;
  }

  private uniqueTableId(preferred: string): string {
    const base = preferred.replace(/[^\w-]/g, '') || 'tableau';
    if (!this.parts().tables.some((t) => t.id === base)) {
      return base;
    }

    let index = 2;
    while (this.parts().tables.some((t) => t.id === `${base}${index}`)) {
      index += 1;
    }
    return `${base}${index}`;
  }

  private appendPlaceholderToActiveZone(placeholder: string): void {
    const zone = this.activeZone();
    this.parts.update((p) => {
      const next = { ...p };
      const currentHtml =
        zone === 'header' ? p.headerHtml : zone === 'footer' ? p.footerHtml : p.bodyHtml;

      if (currentHtml.includes(placeholder)) {
        return next;
      }

      const updatedHtml = `${currentHtml}\n<p>${placeholder}</p>`;
      if (zone === 'header') next.headerHtml = updatedHtml;
      else if (zone === 'footer') next.footerHtml = updatedHtml;
      else next.bodyHtml = updatedHtml;
      return next;
    });

    this.editorInstance?.setData(this.getZoneHtml(zone));
  }

  private syncCurrentZoneFromEditor(): void {
    if (!this.editorInstance) return;
    const html = this.editorInstance.getData();
    const zone = this.activeZone();
    this.parts.update((p) => {
      const next = { ...p };
      if (zone === 'header') next.headerHtml = html;
      if (zone === 'body') next.bodyHtml = html;
      if (zone === 'footer') next.footerHtml = html;
      return next;
    });
  }
}
