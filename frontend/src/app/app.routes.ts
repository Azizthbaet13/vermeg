import { Routes } from '@angular/router';
import { TemplateEditorComponent } from './template-editor/template-editor.component';

export const routes: Routes = [
  { path: '', component: TemplateEditorComponent, title: 'Éditeur de templates — Vermeg PDF' },
  { path: '**', redirectTo: '' },
];
