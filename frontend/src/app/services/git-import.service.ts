import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { parseGithubUrl } from './git-github';

export {
  DEFAULT_TEMPLATE_BRANCH,
  DEFAULT_TEMPLATE_DIR,
  DEFAULT_TEMPLATE_REPO,
  encodeUtf8ToBase64,
  parseGithubUrl,
  slugifyTemplateFileName,
  type GithubRepo,
} from './git-github';

export interface GitRef {
  name: string;
  type: 'branch' | 'tag';
}

export interface GitPutFileOptions {
  repoUrl: string;
  token?: string;
  branch: string;
  filePath: string;
  content: string;
  message: string;
}

interface GithubBranch {
  name: string;
}

interface GithubTag {
  name: string;
}

interface GithubFileContent {
  content?: string;
  encoding?: string;
  message?: string;
  sha?: string;
  type?: string;
}

@Injectable({ providedIn: 'root' })
export class GitImportService {
  private readonly http = inject(HttpClient);

  parseGithubUrl(url: string) {
    return parseGithubUrl(url);
  }

  async listRefs(repoUrl: string, token: string): Promise<GitRef[]> {
    const repo = this.parseGithubUrl(repoUrl);
    if (!repo) {
      throw new Error('URL GitHub invalide. Exemple : https://github.com/owner/repo');
    }

    const headers = this.authHeaders(token);
    const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;

    const [branches, tags] = await Promise.all([
      firstValueFrom(this.http.get<GithubBranch[]>(`${base}/branches`, { headers })),
      firstValueFrom(this.http.get<GithubTag[]>(`${base}/tags`, { headers })),
    ]);

    const branchRefs: GitRef[] = branches.map((b) => ({ name: b.name, type: 'branch' }));
    const tagRefs: GitRef[] = tags.map((t) => ({ name: t.name, type: 'tag' }));

    return [...branchRefs, ...tagRefs];
  }

  async fetchFile(
    repoUrl: string,
    token: string,
    ref: string,
    filePath: string,
  ): Promise<string> {
    const repo = this.parseGithubUrl(repoUrl);
    if (!repo) {
      throw new Error('URL GitHub invalide.');
    }

    const normalizedPath = filePath.trim().replace(/^\/+/, '');
    if (!normalizedPath) {
      throw new Error('Le chemin du fichier est obligatoire.');
    }

    const headers = this.authHeaders(token);
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${normalizedPath}?ref=${encodeURIComponent(ref)}`;

    const response = await firstValueFrom(
      this.http.get<GithubFileContent>(url, { headers }),
    );

    if (!response.content || response.encoding !== 'base64') {
      throw new Error(response.message ?? 'Impossible de lire le fichier depuis GitHub.');
    }

    return this.decodeBase64Utf8(response.content);
  }

  async putFile(options: GitPutFileOptions): Promise<{ path: string; branch: string; updated: boolean }> {
    const repo = this.parseGithubUrl(options.repoUrl);
    if (!repo) {
      throw new Error('URL GitHub invalide.');
    }

    const normalizedPath = options.filePath.trim().replace(/^\/+/, '');
    if (!normalizedPath) {
      throw new Error('Le chemin du fichier est obligatoire.');
    }
    if (!options.message.trim()) {
      throw new Error('Le message de commit est obligatoire.');
    }

    return firstValueFrom(
      this.http.post<{ path: string; branch: string; updated: boolean }>('/api/git/commit', {
        repoUrl: options.repoUrl,
        token: options.token ?? '',
        branch: options.branch.trim(),
        filePath: normalizedPath,
        content: options.content,
        message: options.message.trim(),
      }),
    );
  }

  private async getExistingSha(
    contentsUrl: string,
    branch: string,
    headers: HttpHeaders,
  ): Promise<string | undefined> {
    try {
      const existing = await firstValueFrom(
        this.http.get<GithubFileContent>(
          `${contentsUrl}?ref=${encodeURIComponent(branch)}`,
          { headers },
        ),
      );
      if (existing.type === 'dir') {
        throw new Error('Le chemin pointe vers un dossier, pas un fichier.');
      }
      return existing.sha;
    } catch (err) {
      if (this.isNotFound(err)) {
        return undefined;
      }
      throw err;
    }
  }

  private isNotFound(err: unknown): boolean {
    return (
      (err instanceof HttpErrorResponse && err.status === 404) ||
      (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 404)
    );
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  }

  private decodeBase64Utf8(base64: string): string {
    const binary = atob(base64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
}
