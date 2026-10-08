/**
 * Subset of Apache Velocity used by LifeStar / PackManager HTML templates.
 * Directives hidden in HTML comments are unwrapped, then evaluated against JSON.
 */

/** Unwrap Velocity comments and copy LifeStar `id="$!{path}"` bindings into visible text. */
export function prepareVelocityHtml(template: string): string {
  if (!template) {
    return template;
  }
  return hoistLifeStarIdBindings(unwrapDirectiveComments(decodeEntities(template)));
}

export function renderVelocity(template: string, data: Record<string, unknown>): string {
  if (!template) {
    return template;
  }

  const prepared = prepareVelocityHtml(template);
  if (!looksLikeVelocity(prepared) && !hasDummyPlaceholder(prepared)) {
    return template;
  }

  try {
    const rendered = looksLikeVelocity(prepared)
      ? renderBlock(prepared, { ...data })
      : prepared;
    return cleanupLifeStarOutput(rendered);
  } catch (err) {
    if (err instanceof VelocityBreak) {
      return cleanupLifeStarOutput(err.html);
    }
    throw err;
  }
}

export function looksLikeVelocity(template: string): boolean {
  return /\$!?\{?[A-Za-z_]/.test(template) || /#(if|foreach|set|end)\b/.test(template);
}

function unwrapDirectiveComments(html: string): string {
  return html.replace(/<!--([\s\S]*?)-->/g, (full, body: string) => {
    if (/#(?:if|foreach|set|end|else|elseif|break)\b/.test(body) || /\$!?\{?[A-Za-z_]/.test(body)) {
      return body;
    }
    return full;
  });
}

const VELOCITY_ID_RE = /\$!?\{[^}]+\}|\$!?[A-Za-z_][\w.]*/;
const DUMMY_PLACEHOLDER_RE = /^\[[A-Za-z][\w\s]*\]$/;

function hasDummyPlaceholder(html: string): boolean {
  return /\[[A-Za-z][\w\s]*\]/.test(html);
}

function isDummyPlaceholder(text: string): boolean {
  return DUMMY_PLACEHOLDER_RE.test(text.trim());
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * LifeStar stores the Velocity path on span id and leaves [name]/[label] as inner text.
 * Copy the expression into the visible content so substitution fills the PDF.
 */
function hoistLifeStarIdBindings(html: string): string {
  return html.replace(
    /<span([^>]*\sid\s*=\s*(["'])(\$!?\{[^}]+\}|\$!?[A-Za-z_][\w.]*)\2[^>]*)>([\s\S]*?)<\/span>/gi,
    (full, attrs: string, _quote: string, expr: string, inner: string) => {
      const text = visibleText(inner);
      if (text && !isDummyPlaceholder(text)) {
        return full;
      }
      return `<span${attrs}>${expr}</span>`;
    },
  );
}

function fillPlaceholdersFromResolvedId(html: string): string {
  return html.replace(
    /<span([^>]*\sid\s*=\s*(["'])([^"']+)\2[^>]*)>([\s\S]*?)<\/span>/gi,
    (full, attrs: string, _quote: string, id: string, inner: string) => {
      const text = visibleText(inner);
      if (!isDummyPlaceholder(text)) {
        return full;
      }
      if (!id || VELOCITY_ID_RE.test(id) || isDummyPlaceholder(id)) {
        return full;
      }
      return `<span${attrs}>${id}</span>`;
    },
  );
}

function cleanupLifeStarOutput(html: string): string {
  let out = fillPlaceholdersFromResolvedId(html);
  out = out.replace(
    /<(span|b|strong|em|i)([^>]*)>\s*\[[A-Za-z][\w\s]*\]\s*<\/\1>/gi,
    '',
  );

  let previous = '';
  while (out !== previous) {
    previous = out;
    out = out.replace(/<(span|b|strong|em|i)([^>]*)>\s*<\/\1>/gi, '');
    out = out.replace(/<(span|b|strong|em|i)([^>]*)>\s*;\s*<\/\1>/gi, '');
  }

  return out.replace(/\s*;(\s*;)+/g, '');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function renderBlock(source: string, ctx: Record<string, unknown>): string {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const hash = source.indexOf('#', i);
    if (hash < 0) {
      out += substituteRefs(source.slice(i), ctx);
      break;
    }

    out += substituteRefs(source.slice(i, hash), ctx);
    const dir = parseDirective(source, hash);
    if (!dir) {
      out += source[hash];
      i = hash + 1;
      continue;
    }

    if (dir.name === 'set') {
      applySet(dir.args, ctx);
      i = dir.end;
      continue;
    }

    if (dir.name === 'break') {
      throw new VelocityBreak(out);
    }

    if (dir.name === 'end' || dir.name === 'else' || dir.name === 'elseif') {
      out += source.slice(hash, dir.end);
      i = dir.end;
      continue;
    }

    if (dir.name === 'if') {
      const block = extractControlBlock(source, dir.end, 'if');
      out += renderIf(dir.args, block, ctx);
      i = block.end;
      continue;
    }

    if (dir.name === 'foreach') {
      const block = extractControlBlock(source, dir.end, 'foreach');
      out += renderForeach(dir.args, block.body, ctx);
      i = block.end;
      continue;
    }

    out += source[hash];
    i = hash + 1;
  }

  return out;
}

class VelocityBreak {
  constructor(readonly html: string) {}
}

interface Directive {
  name: string;
  args: string;
  end: number;
}

function parseDirective(source: string, hash: number): Directive | null {
  const rest = source.slice(hash);
  const nameMatch = /^#(if|elseif|else|end|foreach|set|break)\b/.exec(rest);
  if (!nameMatch) {
    return null;
  }

  const name = nameMatch[1];
  let cursor = hash + nameMatch[0].length;

  if (name === 'else' || name === 'end' || name === 'break') {
    return { name, args: '', end: cursor };
  }

  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1;
  }

  if (source[cursor] !== '(') {
    return { name, args: '', end: cursor };
  }

  const close = findMatchingParen(source, cursor);
  if (close < 0) {
    return { name, args: source.slice(cursor), end: source.length };
  }

  return {
    name,
    args: source.slice(cursor + 1, close).trim(),
    end: close + 1,
  };
}

function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

interface ControlBlock {
  body: string;
  end: number;
  branches?: Array<{ cond: string | null; body: string }>;
}

function extractControlBlock(
  source: string,
  from: number,
  kind: 'if' | 'foreach',
): ControlBlock {
  let depth = 1;
  let i = from;
  const branches: Array<{ cond: string | null; body: string }> = [];
  let branchStart = from;
  let branchCond: string | null = kind === 'if' ? '__current__' : null;

  while (i < source.length) {
    const hash = source.indexOf('#', i);
    if (hash < 0) {
      break;
    }

    const dir = parseDirective(source, hash);
    if (!dir) {
      i = hash + 1;
      continue;
    }

    if (dir.name === 'if' || dir.name === 'foreach') {
      depth += 1;
      i = dir.end;
      continue;
    }

    if (dir.name === 'end') {
      depth -= 1;
      if (depth === 0) {
        if (kind === 'if') {
          branches.push({
            cond: branchCond,
            body: source.slice(branchStart, hash),
          });
          return { body: source.slice(from, hash), end: dir.end, branches };
        }
        return { body: source.slice(from, hash), end: dir.end };
      }
      i = dir.end;
      continue;
    }

    if (kind === 'if' && depth === 1 && (dir.name === 'elseif' || dir.name === 'else')) {
      branches.push({
        cond: branchCond,
        body: source.slice(branchStart, hash),
      });
      branchCond = dir.name === 'else' ? null : dir.args;
      branchStart = dir.end;
      i = dir.end;
      continue;
    }

    i = dir.end;
  }

  return { body: source.slice(from), end: source.length, branches };
}

function renderIf(
  cond: string,
  block: ControlBlock,
  ctx: Record<string, unknown>,
): string {
  const branches = block.branches ?? [{ cond: '__current__', body: block.body }];
  for (const branch of branches) {
    const ok =
      branch.cond === null
        ? true
        : branch.cond === '__current__'
          ? isTruthy(evalExpression(cond, ctx))
          : isTruthy(evalExpression(branch.cond, ctx));
    if (ok) {
      return renderBlock(branch.body, ctx);
    }
  }
  return '';
}

function renderForeach(args: string, body: string, ctx: Record<string, unknown>): string {
  const match = /^\$([A-Za-z_][\w]*)\s+in\s+(.+)$/i.exec(args.trim());
  if (!match) {
    return '';
  }

  const itemName = match[1];
  const list = asList(evalExpression(match[2].trim(), ctx));
  let out = '';

  for (const item of list) {
    const child = { ...ctx, [itemName]: item };
    try {
      out += renderBlock(body, child);
    } catch (err) {
      if (err instanceof VelocityBreak) {
        out += err.html;
        break;
      }
      throw err;
    }
  }

  return out;
}

function applySet(args: string, ctx: Record<string, unknown>): void {
  const match = /^\$([A-Za-z_][\w]*)\s*=\s*([\s\S]+)$/.exec(args.trim());
  if (!match) {
    return;
  }
  ctx[match[1]] = evalExpression(match[2].trim(), ctx);
}

function asList(value: unknown): unknown[] {
  if (value === undefined || value === null || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'object') {
    return [value];
  }
  return [];
}

function substituteRefs(text: string, ctx: Record<string, unknown>): string {
  if (!text) {
    return '';
  }

  return text.replace(
    /\$!?\{([A-Za-z_][\w.]*(?:\([^)]*\))?(?:\.[A-Za-z_][\w]*(?:\([^)]*\))?)*)\}|\$!?([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*(?:\([^)]*\))?)*)/g,
    (full, braced?: string, bare?: string) => {
      const expr = (braced ?? bare ?? '').trim();
      if (!expr || expr === 'null') {
        return '';
      }
      const value = evalChain(expr, ctx);
      if (value === undefined || value === null) {
        return '';
      }
      if (typeof value === 'object') {
        return '';
      }
      return String(value);
    },
  );
}

function evalExpression(expr: string, ctx: Record<string, unknown>): unknown {
  const trimmed = expr.trim();
  if (!trimmed) {
    return '';
  }

  if (/\$\{/.test(trimmed) && !/^\$!?\{[A-Za-z_][\w.]*(?:\.[A-Za-z_][\w.]*)*\}$/.test(trimmed)) {
    return interpolateString(trimmed.replace(/^['"]|['"]$/g, ''), ctx);
  }

  const orParts = splitTopLevel(trimmed, '||');
  if (orParts.length > 1) {
    return orParts.some((part) => isTruthy(evalExpression(part, ctx)));
  }

  const andParts = splitTopLevel(trimmed, '&&');
  if (andParts.length > 1) {
    return andParts.every((part) => isTruthy(evalExpression(part, ctx)));
  }

  const cmp = /^(.*?)(==|!=|>=|<=|>|<)(.*)$/.exec(trimmed);
  if (cmp) {
    const left = evalExpression(cmp[1], ctx);
    const right = evalExpression(cmp[3], ctx);
    return compare(left, cmp[2], right);
  }

  if (trimmed.startsWith('!')) {
    return !isTruthy(evalExpression(trimmed.slice(1), ctx));
  }

  const str = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  if (str) {
    return interpolateString(str[2], ctx);
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed === '$null' || trimmed === 'null') {
    return null;
  }

  if (trimmed.startsWith('$')) {
    return evalRef(trimmed, ctx);
  }

  return evalChain(trimmed, ctx);
}

function interpolateString(value: string, ctx: Record<string, unknown>): string {
  return value.replace(/\$\{([^}]+)\}|\$([A-Za-z_][\w.]*)/g, (_, braced?: string, bare?: string) => {
    const result = evalChain((braced ?? bare ?? '').trim(), ctx);
    return result === undefined || result === null ? '' : String(result);
  });
}

function evalRef(raw: string, ctx: Record<string, unknown>): unknown {
  const cleaned = raw
    .trim()
    .replace(/^\$!?\{?/, '')
    .replace(/\}$/, '');
  return evalChain(cleaned, ctx);
}

function evalChain(path: string, ctx: Record<string, unknown>): unknown {
  const tokens = tokenizePath(path);
  if (!tokens.length) {
    return undefined;
  }

  let current: unknown = ctx[tokens[0].name];

  for (let i = 1; i < tokens.length; i++) {
    current = applyToken(current, tokens[i], ctx);
  }

  return current;
}

interface PathToken {
  name: string;
  call?: string;
}

function tokenizePath(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  const re = /([A-Za-z_][\w-]*)(\([^)]*\))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(path)) !== null) {
    tokens.push({
      name: match[1],
      call: match[2] ? match[2].slice(1, -1) : undefined,
    });
  }
  return tokens;
}

function applyToken(current: unknown, token: PathToken, ctx: Record<string, unknown>): unknown {
  if (token.name === 'class' && token.call === undefined) {
    return { name: javaClassName(current) };
  }

  if (current === undefined || current === null) {
    if (token.call) {
      return applyCall(undefined, token.call, ctx, token.name);
    }
    return undefined;
  }

  if (token.call) {
    const target =
      typeof current === 'object'
        ? (current as Record<string, unknown>)[token.name]
        : current;
    return applyCall(target ?? current, token.call, ctx, token.name);
  }

  if (typeof current !== 'object') {
    return undefined;
  }

  return (current as Record<string, unknown>)[token.name];
}

function javaClassName(value: unknown): string {
  if (Array.isArray(value)) {
    return 'java.util.ArrayList';
  }
  if (value !== null && typeof value === 'object') {
    return 'java.util.HashMap';
  }
  return '';
}

function applyCall(
  target: unknown,
  argsSource: string,
  ctx: Record<string, unknown>,
  methodName = '',
): unknown {
  const args = splitTopLevel(argsSource, ',').map((arg) => evalExpression(arg.trim(), ctx));

  if (methodName === 'put' && target && typeof target === 'object' && !Array.isArray(target)) {
    const map = target as Record<string, unknown>;
    map[String(args[0])] = args[1];
    return '';
  }

  const str = target === undefined || target === null ? '' : String(target);

  switch (methodName) {
    case 'substring':
      return str.substring(Number(args[0] ?? 0), args[1] === undefined ? undefined : Number(args[1]));
    case 'contains':
      return str.includes(String(args[0] ?? ''));
    case 'compareTo':
      return str.localeCompare(String(args[0] ?? ''));
    case 'equals':
      return str === String(args[0] ?? '');
    case 'toUpperCase':
      return str.toUpperCase();
    case 'toLowerCase':
      return str.toLowerCase();
    default:
      return target;
  }
}

function splitTopLevel(expr: string, sep: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (quote) {
      current += ch;
      if (ch === quote && expr[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      current += ch;
      continue;
    }
    if (depth === 0 && expr.slice(i, i + sep.length) === sep) {
      parts.push(current.trim());
      current = '';
      i += sep.length - 1;
      continue;
    }
    current += ch;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts.length ? parts : [expr];
}

function compare(left: unknown, op: string, right: unknown): boolean {
  const l = normalize(left);
  const r = normalize(right);
  switch (op) {
    case '==':
      return l === r;
    case '!=':
      return l !== r;
    case '>':
      return l > r;
    case '<':
      return l < r;
    case '>=':
      return l >= r;
    case '<=':
      return l <= r;
    default:
      return false;
  }
}

function normalize(value: unknown): string | number {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false || value === 0) {
    return false;
  }
  if (typeof value === 'string' && value.toLowerCase() === 'false') {
    return false;
  }
  return true;
}
