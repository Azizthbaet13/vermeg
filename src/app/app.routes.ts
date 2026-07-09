import { Routes } from '@angular/router';
import { InvoiceEditorComponent } from './invoice-editor/invoice-editor.component';
import { TemplateEditorComponent } from './template-editor/template-editor.component';

export const routes: Routes = [
  { path: '', component: InvoiceEditorComponent, title: 'Facture — Aperçu live' },
  { path: 'templates', component: TemplateEditorComponent, title: 'Templates CKEditor' },
  { path: '**', redirectTo: '' },
];
