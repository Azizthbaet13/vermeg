import { describe, expect, it } from 'vitest';
import { parseZonedTemplate } from './zone-template-parser';
import { renderVelocity } from './velocity-engine';

describe('parseZonedTemplate', () => {
  it('parses template-parts JSON', () => {
    const result = parseZonedTemplate(
      JSON.stringify({
        version: 2,
        parts: {
          headerHtml: '<h1>H</h1>',
          bodyHtml: '<p>B</p>',
          footerHtml: '<p>F</p>',
          headerCss: '.tpl-header { color: red; }',
          bodyCss: '.tpl-body { color: blue; }',
          footerCss: '.tpl-footer { color: green; }',
        },
      }),
    );

    expect(result).toEqual({
      headerHtml: '<h1>H</h1>',
      bodyHtml: '<p>B</p>',
      footerHtml: '<p>F</p>',
      headerCss: '.tpl-header { color: red; }',
      bodyCss: '.tpl-body { color: blue; }',
      footerCss: '.tpl-footer { color: green; }',
      tables: undefined,
    });
  });

  it('parses assembled HTML with tpl-* zones', () => {
    const html = `
<style>
.tpl-header .brand { font-weight: 800; }
.tpl-body { padding-top: 16px; }
.tpl-footer { color: #999; }
</style>
<div class="tpl-root">
  <div class="tpl-header"><div class="brand">Facture</div></div>
  <div class="tpl-body"><p>Articles</p></div>
  <div class="tpl-footer"><span>Merci</span></div>
</div>`;

    const result = parseZonedTemplate(html);
    expect(result?.headerHtml).toContain('Facture');
    expect(result?.bodyHtml).toContain('Articles');
    expect(result?.footerHtml).toContain('Merci');
    expect(result?.headerCss).toContain('.tpl-header');
    expect(result?.bodyCss).toContain('.tpl-body');
    expect(result?.footerCss).toContain('.tpl-footer');
  });

  it('returns null for unstructured HTML', () => {
    expect(parseZonedTemplate('<p>Hello</p>')).toBeNull();
  });

  it('splits classic HTML with header, main and footer plus CSS', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    header { background: #111; color: #fff; }
    .content { padding: 24px; }
    footer { font-size: 12px; }
    body { font-family: sans-serif; }
  </style>
</head>
<body>
  <header><h1>{{title}}</h1></header>
  <main class="content">{{table:articles}}</main>
  <footer>Merci</footer>
</body>
</html>`;

    const result = parseZonedTemplate(html);
    expect(result?.headerHtml).toContain('<header>');
    expect(result?.headerHtml).toContain('{{title}}');
    expect(result?.bodyHtml).toContain('{{table:articles}}');
    expect(result?.bodyHtml).not.toContain('<header>');
    expect(result?.bodyHtml).not.toContain('<footer>');
    expect(result?.footerHtml).toContain('<footer>');
    expect(result?.footerHtml).toContain('Merci');
    expect(result?.headerCss).toContain('header');
    expect(result?.bodyCss).toContain('.content');
    expect(result?.bodyCss).toContain('body');
    expect(result?.footerCss).toContain('footer');
  });

  it('splits classic HTML using header/footer class names', () => {
    const html = `
<style>
  .page-header { font-weight: 700; }
  .page-footer { color: #666; }
  p { margin: 0; }
</style>
<div class="page-header"><strong>Facture</strong></div>
<div class="content"><p>Articles</p></div>
<div class="page-footer"><span>Merci</span></div>`;

    const result = parseZonedTemplate(html);
    expect(result?.headerHtml).toContain('Facture');
    expect(result?.bodyHtml).toContain('Articles');
    expect(result?.footerHtml).toContain('Merci');
    expect(result?.headerCss).toContain('.page-header');
    expect(result?.footerCss).toContain('.page-footer');
    expect(result?.bodyCss).toContain('p {');
  });

  it('falls back to first and last top-level blocks', () => {
    const html = `
<div class="brand">Logo</div>
<section>Contenu central</section>
<div class="legal">Mentions</div>`;

    const result = parseZonedTemplate(html);
    expect(result?.headerHtml).toContain('Logo');
    expect(result?.bodyHtml).toContain('Contenu central');
    expect(result?.footerHtml).toContain('Mentions');
  });

  it('unwraps a single Word-style wrapper and splits tables plus CSS', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    p.MsoNormal { margin: 0; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <div class="Section1">
    <table><tr><td>LifeStar Insurance</td></tr></table>
    <p>Needs and Demand Test</p>
    <table><tr><td>PERSONAL PROFILE</td></tr></table>
    <table><tr><td>Legal footer</td></tr></table>
  </div>
</body>
</html>`;

    const result = parseZonedTemplate(html);
    expect(result?.headerHtml).toContain('LifeStar Insurance');
    expect(result?.bodyHtml).toContain('Needs and Demand Test');
    expect(result?.bodyHtml).toContain('PERSONAL PROFILE');
    expect(result?.footerHtml).toContain('Legal footer');
    expect(result?.bodyCss).toContain('p.MsoNormal');
    expect(result?.bodyCss).toContain('table');
    expect(result?.headerHtml).not.toContain('<style');
    expect(result?.bodyHtml).not.toContain('<style');
  });

  it('extracts CSS even when HTML cannot be split into three zones', () => {
    const html = `<html><head><style>.title { color: navy; }</style></head>
<body><div class="Section1"><p>Only one block</p></div></body></html>`;

    const result = parseZonedTemplate(html);
    expect(result).not.toBeNull();
    expect(result?.bodyHtml).toContain('Only one block');
    expect(result?.bodyHtml).not.toContain('<style');
    expect(result?.bodyCss).toContain('.title');
  });

  it('unwraps unquoted WordSection1 and splits a single wrapping table', () => {
    const html = `<html>
<head><style>td { font-size: 12pt; }</style></head>
<body lang=EN-GB>
<div class=WordSection1>
<table>
  <tr><td>LifeStar header</td></tr>
  <tr><td>Needs and Demand Test</td></tr>
  <tr><td>Legal footer</td></tr>
</table>
</div>
</body>
</html>`;

    const result = parseZonedTemplate(html);
    expect(result?.headerHtml).toContain('LifeStar header');
    expect(result?.bodyHtml).toContain('Needs and Demand Test');
    expect(result?.footerHtml).toContain('Legal footer');
    expect(result?.bodyCss).toContain('td');
    expect(result?.bodyHtml).not.toContain('<style');
  });

  it('splits a nested Word table inside a single wrapper row', () => {
    const html = `<html><head><style>.MsoNormal { margin: 0; }</style></head>
<body>
<div class=WordSection1>
<table>
  <tr>
    <td>
      <table>
        <tr><td>Header banner</td></tr>
        <tr><td>Body questionnaire</td></tr>
        <tr><td>Footer notes</td></tr>
      </table>
    </td>
  </tr>
</table>
</div>
</body></html>`;

    const result = parseZonedTemplate(html);
    expect(result?.headerHtml).toContain('Header banner');
    expect(result?.bodyHtml).toContain('Body questionnaire');
    expect(result?.footerHtml).toContain('Footer notes');
    expect(result?.bodyCss).toContain('.MsoNormal');
  });

  it('parses LifeStar NDT HTML into one header/footer and keeps both Velocity branches in body', () => {
    const html = `<html><head>
<style>
  @media screen { div.divHeader { display: none; } }
  div.divFooter { position: fixed; }
  .title { font-weight: 700; }
</style>
</head><body>
<!-- #if($packageOffer.investorProfile && $packageOffer.investorProfile!="") -->
<div class="title">Needs with profile</div>
<div class="divHeader"><img alt="logo-a" /></div>
<div class="divFooter">Footer A</div>
<!-- #end -->
<!-- #if($packageOffer.investorProfile=="") -->
<div class="title">Needs and Demand Test</div>
First name:&nbsp;<b><span id="$!{packageOffer.holders.insuredEntity.physicalPersonShortDesc.firstName}">[name]</span></b>
<div class="divHeader"><img alt="logo-b" /></div>
<div class="divFooter">Footer B</div>
<!-- #end -->
</body></html>`;

    const result = parseZonedTemplate(html);
    expect(result).not.toBeNull();
    expect(result?.headerHtml).toContain('logo-a');
    expect(result?.headerHtml).not.toContain('logo-b');
    expect(result?.footerHtml).toContain('Footer A');
    expect(result?.footerHtml).not.toContain('Footer B');
    expect(result?.bodyHtml).toContain('Needs with profile');
    expect(result?.bodyHtml).toContain('Needs and Demand Test');
    expect(result?.bodyHtml).not.toContain('divHeader');
    expect(result?.bodyHtml).not.toContain('divFooter');
    expect(result?.bodyHtml).toContain('#if');
    expect(result?.bodyHtml).toContain('packageOffer.holders.insuredEntity.physicalPersonShortDesc.firstName');
    expect(result?.bodyHtml).not.toContain('[name]');
    expect(result?.headerCss).toMatch(/divHeader/i);
    expect(result?.footerCss).toMatch(/divFooter/i);
    expect(result?.bodyCss).toContain('.title');
  });

  it('fills NDT body fields from packageOffer JSON after import parse', () => {
    const html = `<html><body>
<!-- #if($packageOffer.investorProfile=="") -->
First name:&nbsp;<b><span id="$!{packageOffer.holders.insuredEntity.physicalPersonShortDesc.firstName}">[name]</span></b>
Occupation:<span id="$!{packageOffer.holders.insuredEntity.physicalPerson.profession.label}">[label]</span>
<div class="divHeader">logo</div>
<div class="divFooter">legal</div>
<!-- #end -->
</body></html>`;
    const parsed = parseZonedTemplate(html);
    const out = renderVelocity(parsed?.bodyHtml ?? '', {
      packageOffer: {
        investorProfile: '',
        holders: {
          insuredEntity: {
            physicalPersonShortDesc: { firstName: 'Paul' },
            physicalPerson: { profession: { label: 'Applications Programmer' } },
          },
        },
      },
    });
    expect(out).toContain('Paul');
    expect(out).toContain('Applications Programmer');
    expect(out).not.toContain('[name]');
    expect(out).not.toContain('[label]');
  });
});
