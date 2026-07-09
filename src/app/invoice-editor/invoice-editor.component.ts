import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface InvoiceData {
  clientName: string;
  company: string;
  invoiceNumber: string;
  date: string;
  amount: string;
  description: string;
}

const DEFAULT_INVOICE: InvoiceData = {
  clientName: '',
  company: '',
  invoiceNumber: 'FAC-0001',
  date: new Date().toISOString().split('T')[0],
  amount: '500',
  description: '',
};

@Component({
  selector: 'app-invoice-editor',
  imports: [FormsModule],
  templateUrl: './invoice-editor.component.html',
  styleUrl: './invoice-editor.component.css',
})
export class InvoiceEditorComponent {
  private readonly previewRef = viewChild<ElementRef<HTMLElement>>('preview');

  protected readonly invoice = signal<InvoiceData>({ ...DEFAULT_INVOICE });
  protected readonly modifiedFields = signal<Set<keyof InvoiceData>>(new Set());
  protected readonly isGenerating = signal(false);

  protected updateField(field: keyof InvoiceData, value: string): void {
    this.invoice.update((current) => ({ ...current, [field]: value }));
    this.modifiedFields.update((fields) => {
      const next = new Set(fields);
      next.add(field);
      return next;
    });
  }

  protected isModified(field: keyof InvoiceData): boolean {
    return this.modifiedFields().has(field);
  }

  protected formatDateFr(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected formatAmount(amount: string): string {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount ? `${amount} TND` : '0 TND';
    return `${num.toLocaleString('fr-FR')} TND`;
  }

  protected async generatePdf(): Promise<void> {
    const preview = this.previewRef()?.nativeElement;
    if (!preview || this.isGenerating()) return;

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

      pdf.addImage(imgData, 'PNG', margin, margin, maxWidth, Math.min(imgHeight, pageHeight - margin * 2));
      pdf.save(`${this.invoice().invoiceNumber || 'facture'}.pdf`);
    } finally {
      this.isGenerating.set(false);
    }
  }

  protected reset(): void {
    this.invoice.set({ ...DEFAULT_INVOICE, date: new Date().toISOString().split('T')[0] });
    this.modifiedFields.set(new Set());
  }
}
