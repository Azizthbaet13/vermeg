import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_TEMPLATE_BRANCH,
  DEFAULT_TEMPLATE_DIR,
  DEFAULT_TEMPLATE_REPO,
  GitImportService,
  slugifyTemplateFileName,
} from '../services/git-import.service';

@Component({
  selector: 'app-git-commit-modal',
  imports: [FormsModule],
  templateUrl: './git-commit-modal.component.html',
  styleUrl: './git-import-modal.component.css',
})
export class GitCommitModalComponent {
  private readonly gitImport = inject(GitImportService);

  readonly open = input(false);
  readonly templateName = input('template');
  readonly closed = output<void>();
  readonly committed = output<{ path: string; branch: string; updated: boolean }>();
  readonly content = input('');

  protected readonly repoUrl = signal(DEFAULT_TEMPLATE_REPO);
  protected readonly accessToken = signal('');
  protected readonly branch = signal(DEFAULT_TEMPLATE_BRANCH);
  protected readonly filePath = signal(`${DEFAULT_TEMPLATE_DIR}/template.json`);
  protected readonly commitMessage = signal('');
  protected readonly isCommitting = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      const slug = slugifyTemplateFileName(this.templateName());
      this.filePath.set(`${DEFAULT_TEMPLATE_DIR}/${slug}.json`);
      this.commitMessage.set(`chore(templates): enregistrer ${this.templateName().trim() || slug}`);
      this.error.set(null);
    });
  }

  protected close(): void {
    this.error.set(null);
    this.closed.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  protected async submit(): Promise<void> {
    this.error.set(null);

    if (!this.repoUrl().trim()) {
      this.error.set("L'URL du dépôt est obligatoire.");
      return;
    }
    if (!this.branch().trim()) {
      this.error.set('La branche est obligatoire.');
      return;
    }
    if (!this.filePath().trim()) {
      this.error.set('Le chemin du fichier est obligatoire.');
      return;
    }
    if (!this.commitMessage().trim()) {
      this.error.set('Le message de commit est obligatoire.');
      return;
    }
    if (!this.content()) {
      this.error.set('Aucun contenu de template à envoyer.');
      return;
    }

    this.isCommitting.set(true);
    try {
      const result = await this.gitImport.putFile({
        repoUrl: this.repoUrl(),
        token: this.sanitizeToken(this.accessToken()),
        branch: this.branch(),
        filePath: this.filePath(),
        content: this.content(),
        message: this.commitMessage(),
      });
      this.committed.emit(result);
      this.close();
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isCommitting.set(false);
    }
  }

  private sanitizeToken(raw: string): string {
    return raw
      .trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^token\s+/i, '')
      .replace(/['"]/g, '')
      .replace(/\s+/g, '');
  }

  private extractError(err: unknown): string {
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status?: number }).status;
      if (status === 0) {
        return 'Backend injoignable — lancez Spring Boot sur le port 8081 (`cd backend && mvn spring-boot:run`).';
      }
      const body = (err as { error?: { message?: string } | string }).error;
      const message =
        typeof body === 'string'
          ? body
          : body && typeof body === 'object'
            ? body.message
            : undefined;
      if (message) return message;
      if (status === 401) return 'Token invalide ou expiré.';
      if (status === 403) {
        return "Accès refusé (403) : le token n'a pas Contents Read and write (ou public_repo) sur vermeg.";
      }
      if (status === 404) return 'Dépôt, branche ou chemin introuvable.';
      if (status === 409 || status === 422) return 'Conflit GitHub : rechargez puis réessayez (SHA du fichier).';
    }
    if (err instanceof Error) return err.message;
    return 'Erreur lors du commit vers GitHub.';
  }
}
