import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GitImportService, type GitRef } from '../services/git-import.service';
import { parseZonedTemplate, type ParsedZoneParts } from '../services/zone-template-parser';

export interface GitImportResult {
  content: string;
  /** Zones parsées si le fichier Git est structuré (JSON ou HTML assemblé). */
  zones: ParsedZoneParts | null;
  appName?: string;
  filePath: string;
  ref: string;
}

@Component({
  selector: 'app-git-import-modal',
  imports: [FormsModule],
  templateUrl: './git-import-modal.component.html',
  styleUrl: './git-import-modal.component.css',
})
export class GitImportModalComponent {
  private readonly gitImport = inject(GitImportService);

  readonly open = input(false);
  readonly closed = output<void>();
  readonly imported = output<GitImportResult>();

  protected readonly appName = signal('');
  protected readonly repoUrl = signal('');
  protected readonly accessToken = signal('');
  protected readonly selectedRef = signal('main');
  protected readonly filePath = signal('');
  protected readonly refs = signal<GitRef[]>([]);
  protected readonly isLoadingRefs = signal(false);
  protected readonly isImporting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected close(): void {
    this.error.set(null);
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  protected async loadRefs(): Promise<void> {
    this.error.set(null);
    if (!this.repoUrl().trim() || !this.accessToken().trim()) {
      this.error.set('URL et token sont requis pour charger les branches/tags.');
      return;
    }

    this.isLoadingRefs.set(true);
    try {
      const refs = await this.gitImport.listRefs(this.repoUrl(), this.accessToken());
      this.refs.set(refs);
      const hasMain = refs.some((r) => r.name === 'main');
      if (hasMain) {
        this.selectedRef.set('main');
      } else if (refs.length > 0) {
        this.selectedRef.set(refs[0].name);
      }
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isLoadingRefs.set(false);
    }
  }

  protected async submit(): Promise<void> {
    this.error.set(null);

    if (!this.repoUrl().trim()) {
      this.error.set('L\'URL du dépôt est obligatoire.');
      return;
    }
    if (!this.accessToken().trim()) {
      this.error.set('Le token d\'accès est obligatoire.');
      return;
    }
    if (!this.selectedRef().trim()) {
      this.error.set('La branche/tag est obligatoire.');
      return;
    }
    if (!this.filePath().trim()) {
      this.error.set('Le chemin du fichier est obligatoire.');
      return;
    }

    this.isImporting.set(true);
    try {
      const content = await this.gitImport.fetchFile(
        this.repoUrl(),
        this.accessToken(),
        this.selectedRef(),
        this.filePath(),
      );

      this.imported.emit({
        content,
        zones: parseZonedTemplate(content),
        appName: this.appName().trim() || undefined,
        filePath: this.filePath().trim(),
        ref: this.selectedRef(),
      });
      this.close();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isImporting.set(false);
    }
  }

  protected refLabel(ref: GitRef): string {
    return ref.type === 'tag' ? `tag: ${ref.name}` : ref.name;
  }

  private extractError(err: unknown): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const apiErr = (err as { error?: { message?: string }; status?: number }).error;
      const status = (err as { status?: number }).status;
      if (status === 401) return 'Token invalide ou expiré.';
      if (status === 404) return 'Dépôt, branche ou fichier introuvable.';
      if (apiErr?.message) return apiErr.message;
    }
    if (err instanceof Error) return err.message;
    return 'Erreur lors de la connexion au dépôt Git.';
  }
}
