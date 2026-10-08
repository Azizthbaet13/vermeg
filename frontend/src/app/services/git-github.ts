export const DEFAULT_TEMPLATE_REPO = 'https://github.com/Azizthbaet13/vermeg';
export const DEFAULT_TEMPLATE_BRANCH = 'templates-only';
export const DEFAULT_TEMPLATE_DIR = 'templates';

export interface GithubRepo {
  owner: string;
  repo: string;
}

export function parseGithubUrl(url: string): GithubRepo | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(trimmed);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/, '') };
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.includes('github.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/, ''),
    };
  } catch {
    return null;
  }
}

export function encodeUtf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function slugifyTemplateFileName(name: string): string {
  const slug = name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'template';
}
