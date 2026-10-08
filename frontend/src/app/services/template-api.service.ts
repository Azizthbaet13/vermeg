import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { TemplateApiPayload, TemplateApiRecord } from '../models/template-types';

export interface TemplatePage {
  content: TemplateApiRecord[];
  totalElements: number;
  totalPages: number;
  number: number;
}

@Injectable({ providedIn: 'root' })
export class TemplateApiService {
  private readonly http = inject(HttpClient);
  /** Relatif : proxy Angular → http://localhost:8081 */
  private readonly baseUrl = '/api/templates';

  create(payload: TemplateApiPayload): Promise<TemplateApiRecord> {
    return this.request(() => firstValueFrom(this.http.post<TemplateApiRecord>(this.baseUrl, payload)));
  }

  update(id: number, payload: TemplateApiPayload): Promise<TemplateApiRecord> {
    return this.request(() =>
      firstValueFrom(this.http.put<TemplateApiRecord>(`${this.baseUrl}/${id}`, payload)),
    );
  }

  getById(id: number): Promise<TemplateApiRecord> {
    return this.request(() => firstValueFrom(this.http.get<TemplateApiRecord>(`${this.baseUrl}/${id}`)));
  }

  list(page = 0, size = 50): Promise<TemplatePage> {
    return this.request(() =>
      firstValueFrom(
        this.http.get<TemplatePage>(this.baseUrl, { params: { page, size, sort: 'updatedAt,desc' } }),
      ),
    );
  }

  delete(id: number): Promise<void> {
    return this.request(() => firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${id}`)));
  }

  async generatePdf(
    id: number,
    data: Record<string, unknown>,
    renderedHtml?: string,
  ): Promise<Blob> {
    try {
      const body =
        renderedHtml && renderedHtml.trim()
          ? { ...data, __pdfRenderedHtml: renderedHtml }
          : data;
      return await firstValueFrom(
        this.http.post(`${this.baseUrl}/${id}/generate`, body, { responseType: 'blob' }),
      );
    } catch (err) {
      throw await this.toError(err);
    }
  }

  private async request<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw await this.toError(err);
    }
  }

  private async toError(err: unknown): Promise<Error> {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return new Error(
          'Backend injoignable — lancez Spring Boot (`cd backend && mvn spring-boot:run`) sur le port 8081.',
        );
      }

      if (err.error instanceof Blob) {
        try {
          const parsed = JSON.parse(await err.error.text()) as { message?: string };
          if (parsed.message) return new Error(parsed.message);
        } catch {
          /* ignore */
        }
      } else if (err.error && typeof err.error === 'object' && 'message' in err.error) {
        return new Error(String((err.error as { message: string }).message));
      } else if (typeof err.error === 'string' && err.error.trim()) {
        return new Error(err.error);
      }

      return new Error(err.message || `Erreur HTTP ${err.status}`);
    }

    if (err instanceof Error) return err;
    return new Error('Erreur inattendue lors de l’appel API.');
  }
}
