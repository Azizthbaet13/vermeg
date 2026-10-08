import { describe, expect, it } from 'vitest';
import {
  encodeUtf8ToBase64,
  parseGithubUrl,
  slugifyTemplateFileName,
} from './git-github';

describe('git-github helpers', () => {
  it('parses https github urls', () => {
    expect(parseGithubUrl('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGithubUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGithubUrl('https://github.com/Azizthbaet13/vermeg/branches')).toEqual({
      owner: 'Azizthbaet13',
      repo: 'vermeg',
    });
  });

  it('parses ssh github urls', () => {
    expect(parseGithubUrl('git@github.com:owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('returns null for invalid urls', () => {
    expect(parseGithubUrl('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseGithubUrl('not-a-url')).toBeNull();
  });

  it('encodes UTF-8 as base64 for the GitHub contents API', () => {
    const encoded = encodeUtf8ToBase64('{"name":"été"}');
    const binary = atob(encoded);
    const decoded = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    expect(decoded).toBe('{"name":"été"}');
  });

  it('slugifies template file names', () => {
    expect(slugifyTemplateFileName('NDT Loan Protect')).toBe('ndt-loan-protect');
    expect(slugifyTemplateFileName('  ')).toBe('template');
  });
});
