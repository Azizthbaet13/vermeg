import type { TemplateParts, TableSchema } from '../models/template-types';
import { prepareVelocityHtml } from './velocity-engine';

export type ParsedZoneParts = Pick<
  TemplateParts,
  'headerHtml' | 'bodyHtml' | 'footerHtml' | 'headerCss' | 'bodyCss' | 'footerCss'
> & {
  tables?: TableSchema[];
};

/**
 * Parse an imported file (JSON zones or HTML assemblé) into header/body/footer + CSS.
 */
export function parseZonedTemplate(content: string): ParsedZoneParts | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const fromJson = tryParseJsonParts(trimmed);
  if (fromJson) return fromJson;

  const fromAssembled = tryParseAssembledHtml(trimmed);
  if (fromAssembled) return fromAssembled;

  const fromMarkers = tryParseZoneMarkers(trimmed);
  if (fromMarkers) return fromMarkers;

  const fromNdt = tryParseNdtTemplate(trimmed);
  if (fromNdt) return fromNdt;

  const fromClassic = tryParseClassicHtml(trimmed);
  if (fromClassic) return fromClassic;

  return null;
}

function tryParseJsonParts(content: string): ParsedZoneParts | null {
  if (!content.startsWith('{') && !content.startsWith('[')) return null;
  try {
    const raw = JSON.parse(content) as {
      version?: number;
      parts?: Partial<TemplateParts>;
      headerHtml?: string;
      bodyHtml?: string;
      footerHtml?: string;
      headerCss?: string;
      bodyCss?: string;
      footerCss?: string;
      tables?: TableSchema[];
    };

    const parts = raw.parts ?? raw;
    if (
      typeof parts.headerHtml !== 'string' &&
      typeof parts.bodyHtml !== 'string' &&
      typeof parts.footerHtml !== 'string'
    ) {
      return null;
    }

    return {
      headerHtml: parts.headerHtml ?? '',
      bodyHtml: parts.bodyHtml ?? '',
      footerHtml: parts.footerHtml ?? '',
      headerCss: parts.headerCss ?? '',
      bodyCss: parts.bodyCss ?? '',
      footerCss: parts.footerCss ?? '',
      tables: parts.tables,
    };
  } catch {
    return null;
  }
}

function tryParseAssembledHtml(html: string): ParsedZoneParts | null {
  const hasZones =
    /class=["'][^"']*\btpl-header\b/i.test(html) ||
    /class=["'][^"']*\btpl-body\b/i.test(html) ||
    /class=["'][^"']*\btpl-footer\b/i.test(html);

  if (!hasZones) return null;

  const headerHtml = extractInnerByClass(html, 'tpl-header');
  const bodyHtml = extractInnerByClass(html, 'tpl-body');
  const footerHtml = extractInnerByClass(html, 'tpl-footer');

  const styles = extractAllStyles(html);
  const { headerCss, bodyCss, footerCss } = splitCssByZone(styles, 'assembled');

  return {
    headerHtml: headerHtml ?? '',
    bodyHtml: bodyHtml ?? '',
    footerHtml: footerHtml ?? '',
    headerCss,
    bodyCss,
    footerCss,
  };
}

function tryParseZoneMarkers(content: string): ParsedZoneParts | null {
  const headerHtml = extractMarkedSection(content, 'HEADER');
  const bodyHtml = extractMarkedSection(content, 'BODY');
  const footerHtml = extractMarkedSection(content, 'FOOTER');
  const headerCss = extractMarkedSection(content, 'HEADER-CSS') ?? '';
  const bodyCss = extractMarkedSection(content, 'BODY-CSS') ?? '';
  const footerCss = extractMarkedSection(content, 'FOOTER-CSS') ?? '';

  if (headerHtml === null && bodyHtml === null && footerHtml === null) {
    return null;
  }

  return {
    headerHtml: headerHtml ?? '',
    bodyHtml: bodyHtml ?? '',
    footerHtml: footerHtml ?? '',
    headerCss,
    bodyCss,
    footerCss,
  };
}

function extractMarkedSection(content: string, zone: string): string | null {
  const re = new RegExp(
    `<!--\\s*ZONE:${zone}\\s*-->([\\s\\S]*?)(?=<!--\\s*ZONE:|$)`,
    'i',
  );
  const match = re.exec(content);
  return match ? match[1].trim() : null;
}

function extractInnerByClass(html: string, className: string): string | null {
  const openRe = new RegExp(
    `<([a-zA-Z0-9]+)([^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*)>`,
    'i',
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) return null;

  const tag = openMatch[1];
  const startIndex = openMatch.index + openMatch[0].length;
  const closeTag = `</${tag}>`;
  let depth = 1;
  let i = startIndex;
  const openTagRe = new RegExp(`<${tag}\\b`, 'gi');
  const closeTagRe = new RegExp(`</${tag}>`, 'gi');

  while (i < html.length && depth > 0) {
    openTagRe.lastIndex = i;
    closeTagRe.lastIndex = i;
    const nextOpen = openTagRe.exec(html);
    const nextClose = closeTagRe.exec(html);
    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      if (depth === 0) {
        return html.slice(startIndex, nextClose.index).trim();
      }
      i = nextClose.index + closeTag.length;
    }
  }

  return null;
}

const HEADER_CLASS_HINTS = ['page-header', 'site-header', 'navbar', 'nav-bar', 'masthead', 'header'];
const FOOTER_CLASS_HINTS = ['page-footer', 'site-footer', 'footer'];

function looksLikeNdtTemplate(html: string): boolean {
  return (
    /class\s*=\s*(?:["'][^"']*\bdivHeader\b|divHeader\b)/i.test(html) ||
    /class\s*=\s*(?:["'][^"']*\bdivFooter\b|divFooter\b)/i.test(html) ||
    /div\.divHeader/i.test(html) ||
    /\$packageOffer\.investorProfile/i.test(html)
  );
}

/**
 * LifeStar NDT HTML: print header/footer (divHeader/divFooter) plus two Velocity
 * copies of the form. Keep one header/footer and the full body so #if can pick a branch.
 */
function tryParseNdtTemplate(html: string): ParsedZoneParts | null {
  if (!looksLikeNdtTemplate(html)) {
    return null;
  }

  const css = extractAllStyles(html);
  let bodyInner = extractBodyInner(html);
  if (!bodyInner.trim()) {
    return null;
  }

  bodyInner = prepareVelocityHtml(bodyInner);

  const headers = extractAllBlocksByClass(bodyInner, 'divHeader');
  const footers = extractAllBlocksByClass(bodyInner, 'divFooter');
  const headerHtml = headers[0]?.outer.trim() ?? '';
  const footerHtml = footers[0]?.outer.trim() ?? '';
  const bodyHtml = prepareVelocityHtml(removeBlocks(bodyInner, [...headers, ...footers]).trim());

  const { headerCss, bodyCss, footerCss } = splitCssByZone(css, 'classic');

  return {
    headerHtml: prepareVelocityHtml(headerHtml),
    bodyHtml,
    footerHtml: prepareVelocityHtml(footerHtml),
    headerCss,
    bodyCss,
    footerCss,
  };
}

interface HtmlBlock {
  outer: string;
  start: number;
  end: number;
}

function tryParseClassicHtml(html: string): ParsedZoneParts | null {
  if (!looksLikeHtml(html)) {
    return null;
  }

  const css = extractAllStyles(html);
  const bodyInner = extractBodyInner(html);
  if (!bodyInner.trim()) {
    return null;
  }

  const source = unwrapLayoutWrappers(bodyInner);
  const headerBlock = findHeaderBlock(source);
  const footerBlock = findFooterBlock(source, headerBlock);

  let headerHtml = headerBlock?.outer.trim() ?? '';
  let footerHtml = footerBlock?.outer.trim() ?? '';
  let bodyHtml = removeBlocks(source, [headerBlock, footerBlock]).trim();

  if (!headerHtml && !footerHtml) {
    const fallback = splitTopLevelFallback(source) ?? splitSingleTableFallback(source);
    if (fallback) {
      headerHtml = fallback.headerHtml;
      bodyHtml = fallback.bodyHtml;
      footerHtml = fallback.footerHtml;
    } else if (css.trim() || looksLikeFullDocument(html)) {
      bodyHtml = source;
    } else {
      return null;
    }
  }

  const { headerCss, bodyCss, footerCss } = splitCssByZone(css, 'classic');

  return {
    headerHtml,
    bodyHtml,
    footerHtml,
    headerCss,
    bodyCss,
    footerCss,
  };
}

function looksLikeHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

function looksLikeFullDocument(html: string): boolean {
  return /<html\b/i.test(html) || /<body\b/i.test(html) || /<style\b/i.test(html);
}

function unwrapLayoutWrappers(html: string): string {
  let current = html.trim();

  for (let pass = 0; pass < 6; pass++) {
    const blocks = extractTopLevelBlocks(current);
    if (blocks.length !== 1) {
      return current;
    }

    const inner = innerOf(blocks[0]).trim();
    if (!inner) {
      return current;
    }

    const innerBlocks = extractTopLevelBlocks(inner);
    if (innerBlocks.length < 2) {
      return inner;
    }

    current = inner;
  }

  return current;
}

function innerOf(block: HtmlBlock): string {
  const firstGt = block.outer.indexOf('>');
  const lastClose = block.outer.lastIndexOf('</');
  if (firstGt < 0 || lastClose <= firstGt) {
    return '';
  }
  return block.outer.slice(firstGt + 1, lastClose);
}

function extractBodyInner(html: string): string {
  let work = html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<xml\b[\s\S]*?<\/xml>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<link\b[^>]*>/gi, '');

  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(work);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }

  return work
    .replace(/<!DOCTYPE[^>]*>/i, '')
    .replace(/<\/?html\b[^>]*>/gi, '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .trim();
}

function findHeaderBlock(html: string): HtmlBlock | null {
  return (
    extractBlockByTag(html, 'header') ??
    extractBlockById(html, 'header') ??
    extractBlockByClasses(html, HEADER_CLASS_HINTS)
  );
}

function findFooterBlock(html: string, header: HtmlBlock | null): HtmlBlock | null {
  const candidates = [
    extractLastBlockByTag(html, 'footer'),
    extractLastBlockById(html, 'footer'),
    extractLastBlockByClasses(html, FOOTER_CLASS_HINTS),
  ].filter((block): block is HtmlBlock => Boolean(block));

  const afterHeader = header
    ? candidates.filter((block) => block.start >= header.end)
    : candidates;

  const pool = afterHeader.length ? afterHeader : candidates;
  if (!pool.length) {
    return null;
  }

  return pool.reduce((latest, block) => (block.start > latest.start ? block : latest));
}

function splitTopLevelFallback(html: string): {
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
} | null {
  const blocks = extractTopLevelBlocks(html);
  if (blocks.length >= 3) {
    return {
      headerHtml: blocks[0].outer.trim(),
      footerHtml: blocks[blocks.length - 1].outer.trim(),
      bodyHtml: blocks
        .slice(1, -1)
        .map((block) => block.outer)
        .join('\n')
        .trim(),
    };
  }

  if (blocks.length === 2) {
    return {
      headerHtml: blocks[0].outer.trim(),
      bodyHtml: blocks[1].outer.trim(),
      footerHtml: '',
    };
  }

  return null;
}

function splitSingleTableFallback(html: string, depth = 0): {
  headerHtml: string;
  bodyHtml: string;
  footerHtml: string;
} | null {
  if (depth > 4) {
    return null;
  }

  const table = extractBlockByTag(html, 'table');
  if (!table) {
    return null;
  }

  const rows = extractTableRows(innerOf(table));
  if (rows.length >= 3) {
    return {
      headerHtml: wrapAsTable(rows[0].outer),
      bodyHtml: wrapAsTable(rows.slice(1, -1).map((row) => row.outer).join('\n')),
      footerHtml: wrapAsTable(rows[rows.length - 1].outer),
    };
  }

  if (rows.length === 1) {
    return splitSingleTableFallback(innerOf(rows[0]), depth + 1);
  }

  if (rows.length === 2) {
    return {
      headerHtml: wrapAsTable(rows[0].outer),
      bodyHtml: wrapAsTable(rows[1].outer),
      footerHtml: '',
    };
  }

  return null;
}

function extractTableRows(tableInner: string): HtmlBlock[] {
  const top = extractTopLevelBlocks(tableInner);
  const rows: HtmlBlock[] = [];

  for (const block of top) {
    const tag = tagNameOf(block);
    if (/^tr$/i.test(tag)) {
      rows.push(block);
      continue;
    }
    if (/^t(head|body|foot)$/i.test(tag)) {
      rows.push(
        ...extractTopLevelBlocks(innerOf(block)).filter((child) => /^tr$/i.test(tagNameOf(child))),
      );
    }
  }

  return rows;
}

function tagNameOf(block: HtmlBlock): string {
  const match = /^<([a-zA-Z][\w:.-]*)/i.exec(block.outer);
  return match?.[1] ?? '';
}

function wrapAsTable(rowsHtml: string): string {
  return `<table>\n${rowsHtml.trim()}\n</table>`;
}

function extractTopLevelBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  const openRe = /<([a-zA-Z][\w:.-]*)\b[^>]*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = openRe.exec(html)) !== null) {
    const tag = match[1];
    if (
      tag.includes(':') ||
      /^(br|hr|img|input|meta|link|source|area|col|embed|wbr)$/i.test(tag)
    ) {
      continue;
    }

    const block = extractBalancedFrom(html, match.index, tag, match[0].length);
    if (!block || block.end <= match.index) {
      continue;
    }

    blocks.push(block);
    openRe.lastIndex = block.end;
  }

  return blocks;
}

function extractBlockByTag(html: string, tag: string): HtmlBlock | null {
  const openRe = new RegExp(`<(${tag})\\b[^>]*>`, 'i');
  const openMatch = openRe.exec(html);
  if (!openMatch) {
    return null;
  }
  return extractBalancedFrom(html, openMatch.index, tag, openMatch[0].length);
}

function extractLastBlockByTag(html: string, tag: string): HtmlBlock | null {
  const openRe = new RegExp(`<(${tag})\\b[^>]*>`, 'gi');
  let last: HtmlBlock | null = null;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    const block = extractBalancedFrom(html, match.index, tag, match[0].length);
    if (block) {
      last = block;
      openRe.lastIndex = block.end;
    }
  }
  return last;
}

function attrEqualsPattern(attr: string, value: string): string {
  return `\\b${attr}\\s*=\\s*(?:["']${value}["']|${value}(?=[\\s>]))`;
}

function classContainsPattern(className: string): string {
  return `\\bclass\\s*=\\s*(?:["'][^"']*\\b${className}\\b[^"']*["']|${className}(?=[\\s>]))`;
}

function extractBlockById(html: string, id: string): HtmlBlock | null {
  const openRe = new RegExp(
    `<([a-zA-Z][\\w:.-]*)([^>]*${attrEqualsPattern('id', id)}[^>]*)>`,
    'i',
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) {
    return null;
  }
  return extractBalancedFrom(html, openMatch.index, openMatch[1], openMatch[0].length);
}

function extractLastBlockById(html: string, id: string): HtmlBlock | null {
  const openRe = new RegExp(
    `<([a-zA-Z][\\w:.-]*)([^>]*${attrEqualsPattern('id', id)}[^>]*)>`,
    'gi',
  );
  let last: HtmlBlock | null = null;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    const block = extractBalancedFrom(html, match.index, match[1], match[0].length);
    if (block) {
      last = block;
      openRe.lastIndex = block.end;
    }
  }
  return last;
}

function extractBlockByClasses(html: string, classNames: string[]): HtmlBlock | null {
  for (const className of classNames) {
    const block = extractBlockByClass(html, className);
    if (block) {
      return block;
    }
  }
  return null;
}

function extractBlockByClass(html: string, className: string): HtmlBlock | null {
  const openRe = new RegExp(
    `<([a-zA-Z][\\w:.-]*)([^>]*${classContainsPattern(className)}[^>]*)>`,
    'i',
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) {
    return null;
  }
  return extractBalancedFrom(html, openMatch.index, openMatch[1], openMatch[0].length);
}

function extractAllBlocksByClass(html: string, className: string): HtmlBlock[] {
  const openRe = new RegExp(
    `<([a-zA-Z][\\w:.-]*)([^>]*${classContainsPattern(className)}[^>]*)>`,
    'gi',
  );
  const blocks: HtmlBlock[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    const block = extractBalancedFrom(html, match.index, match[1], match[0].length);
    if (!block) {
      break;
    }
    blocks.push(block);
    openRe.lastIndex = block.end;
  }
  return blocks;
}

function extractLastBlockByClasses(html: string, classNames: string[]): HtmlBlock | null {
  let last: HtmlBlock | null = null;
  for (const className of classNames) {
    const block = extractLastBlockByClass(html, className);
    if (block && (!last || block.start > last.start)) {
      last = block;
    }
  }
  return last;
}

function extractLastBlockByClass(html: string, className: string): HtmlBlock | null {
  const openRe = new RegExp(
    `<([a-zA-Z][\\w:.-]*)([^>]*${classContainsPattern(className)}[^>]*)>`,
    'gi',
  );
  let last: HtmlBlock | null = null;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    const block = extractBalancedFrom(html, match.index, match[1], match[0].length);
    if (block) {
      last = block;
      openRe.lastIndex = block.end;
    }
  }
  return last;
}

function extractBalancedFrom(
  html: string,
  startIndex: number,
  tag: string,
  openLength: number,
): HtmlBlock | null {
  const closeTag = `</${tag}>`;
  let depth = 1;
  let i = startIndex + openLength;
  const openTagRe = new RegExp(`<${tag}\\b`, 'gi');
  const closeTagRe = new RegExp(`</${tag}>`, 'gi');

  while (i < html.length && depth > 0) {
    openTagRe.lastIndex = i;
    closeTagRe.lastIndex = i;
    const nextOpen = openTagRe.exec(html);
    const nextClose = closeTagRe.exec(html);
    if (!nextClose) {
      break;
    }

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      if (depth === 0) {
        const end = nextClose.index + closeTag.length;
        return {
          outer: html.slice(startIndex, end),
          start: startIndex,
          end,
        };
      }
      i = nextClose.index + closeTag.length;
    }
  }

  return null;
}

function removeBlocks(html: string, blocks: Array<HtmlBlock | null | undefined>): string {
  const valid = blocks
    .filter((block): block is HtmlBlock => Boolean(block))
    .sort((a, b) => b.start - a.start);

  let result = html;
  for (const block of valid) {
    result = result.slice(0, block.start) + result.slice(block.end);
  }
  return result;
}

function extractAllStyles(html: string): string {
  const chunks: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    chunks.push(match[1].replace(/<!--/g, '').replace(/-->/g, '').trim());
  }
  return chunks.join('\n');
}

const HEADER_CSS_RE =
  /(?:^|[,{\s])(?:header|#header|\.header|\.navbar|\.nav-bar|\.page-header|\.site-header|\.masthead|\.tpl-header|\.divHeader)\b/i;
const FOOTER_CSS_RE =
  /(?:^|[,{\s])(?:footer|#footer|\.footer|\.page-footer|\.site-footer|\.tpl-footer|\.divFooter)\b/i;
const BODY_CSS_RE = /(?:^|[,{\s])(?:\.tpl-body|main|#content|\.content|\.main)\b/i;

function splitCssByZone(
  css: string,
  mode: 'assembled' | 'classic' = 'assembled',
): {
  headerCss: string;
  bodyCss: string;
  footerCss: string;
} {
  if (!css.trim()) {
    return { headerCss: '', bodyCss: '', footerCss: '' };
  }

  const rules = splitCssRules(css);
  const header: string[] = [];
  const body: string[] = [];
  const footer: string[] = [];
  const other: string[] = [];

  for (const rule of rules) {
    if (mode === 'classic') {
      if (HEADER_CSS_RE.test(rule) || /\.divHeader\b/i.test(rule)) header.push(rule);
      else if (FOOTER_CSS_RE.test(rule) || /\.divFooter\b/i.test(rule)) footer.push(rule);
      else if (BODY_CSS_RE.test(rule)) body.push(rule);
      else other.push(rule);
    } else if (/\.tpl-header\b/i.test(rule)) {
      header.push(rule);
    } else if (/\.tpl-footer\b/i.test(rule)) {
      footer.push(rule);
    } else if (/\.tpl-body\b/i.test(rule)) {
      body.push(rule);
    } else {
      other.push(rule);
    }
  }

  // Unscoped rules go to body so they are not lost.
  if (other.length) {
    body.push(...other);
  }

  return {
    headerCss: header.join('\n\n').trim(),
    bodyCss: body.join('\n\n').trim(),
    footerCss: footer.join('\n\n').trim(),
  };
}

function splitCssRules(css: string): string[] {
  const rules: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of css) {
    current += char;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const rule = current.trim();
        if (rule) rules.push(rule);
        current = '';
      }
    }
  }

  const leftover = current.trim();
  if (leftover) rules.push(leftover);
  return rules;
}
