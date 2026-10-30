import type { Scene, Script, Settings } from './types';
import { breakdown, cueName } from './screenplay';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

const FONT_STACK =
  "'Courier Prime','Courier New',Courier,'Noto Sans Malayalam','Manjari','Malayalam Sangam MN','Kartika','Noto Sans Tamil','Tamil Sangam MN','Latha',monospace";

/** Screenplay CSS, shared by print/PDF and Word export. Industry layout on US Letter. */
export const SCREENPLAY_CSS = `
@page { size: Letter; margin: 1in 1in 1in 1in; }
body { font-family: ${FONT_STACK}; font-size: 12pt; line-height: 1.25; color: #000; background: #fff; margin: 0; padding-left: 0.5in; }
.title-page { height: 9in; display: flex; flex-direction: column; page-break-after: always; }
.title-page .t-main { margin-top: 3in; text-align: center; }
.title-page h1 { font-size: 14pt; text-transform: uppercase; text-decoration: underline; margin: 0 0 24pt; font-weight: normal; }
.title-page .t-by { text-align: center; }
.title-page .t-contact { margin-top: auto; white-space: pre-wrap; }
.scene { page-break-inside: auto; }
.heading { position: relative; text-transform: uppercase; font-weight: bold; margin: 24pt 0 12pt; page-break-after: avoid; }
.heading .num { position: absolute; left: -0.5in; width: 0.4in; }
.action { margin: 0 0 12pt; white-space: pre-wrap; }
.character { margin: 12pt 0 0 2.2in; text-transform: uppercase; page-break-after: avoid; }
.parenthetical { margin: 0 0 0 1.6in; width: 2in; page-break-after: avoid; }
.dialogue { margin: 0 0 12pt 1in; width: 3.5in; white-space: pre-wrap; }
.parenthetical + .dialogue, .character + .dialogue { margin-top: 0; }
.transition { margin: 12pt 0; text-align: right; text-transform: uppercase; }
`;

function sceneHTML(s: Scene, n: number, numbered: boolean) {
  const body = s.blocks
    .filter((b) => b.text.trim())
    .map((b) => {
      const text = b.type === 'parenthetical' && !/^\(/.test(b.text.trim()) ? `(${b.text.trim()})` : b.text;
      return `<p class="${b.type}">${esc(text)}</p>`;
    })
    .join('\n');
  return `<section class="scene"><p class="heading">${numbered ? `<span class="num">${n}.</span>` : ''}${esc(s.heading || 'UNTITLED SCENE')}</p>\n${body}</section>`;
}

export function titlePageHTML(script: Script) {
  const t = script.titlePage;
  return `<div class="title-page">
  <div class="t-main"><h1>${esc(t.title || script.title)}</h1>
  ${t.writtenBy ? `<p class="t-by">Written by<br><br>${esc(t.writtenBy)}</p>` : ''}
  ${t.basedOn ? `<p class="t-by"><br>${esc(t.basedOn)}</p>` : ''}</div>
  <div class="t-contact">${esc([t.contact, t.draftDate].filter(Boolean).join('\n\n'))}</div>
</div>`;
}

export function scriptHTML(script: Script, opts: { titlePage?: boolean; numbered?: boolean; sceneIds?: string[] } = {}) {
  const { titlePage = true, numbered = true, sceneIds } = opts;
  const scenes = script.scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !sceneIds || sceneIds.includes(s.id))
    .map(({ s, i }) => sceneHTML(s, i + 1, numbered))
    .join('\n');
  return (titlePage ? titlePageHTML(script) : '') + scenes;
}

/** The app's bundled @font-face rules with absolute URLs, so the print view shapes Malayalam/Tamil offline. */
function fontFaceCSS(): string {
  if (typeof document === 'undefined') return '';
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const base = sheet.href ?? location.href;
    for (const r of Array.from(rules)) {
      if (r.constructor.name !== 'CSSFontFaceRule' && !r.cssText.startsWith('@font-face')) continue;
      out.push(r.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, _q, u) => `url("${new URL(u, base).href}")`));
    }
  }
  return out.join('\n');
}

export function fullHTMLDocument(script: Script, opts?: Parameters<typeof scriptHTML>[1]) {
  return `<!doctype html><html lang="${script.language}"><head><meta charset="utf-8"><title>${esc(script.title)}</title>
<style>${fontFaceCSS()}\n${SCREENPLAY_CSS}</style></head><body>${scriptHTML(script, opts)}</body></html>`;
}

/** PDF: open a print view and let the OS "Save as PDF" (keeps proper Malayalam/Tamil shaping). */
export function printPDF(script: Script, opts?: Parameters<typeof scriptHTML>[1]) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(fullHTMLDocument(script, opts));
  doc.close();
  // make the fonts actually load before printing (font-face is lazy until text uses it)
  const loads = Array.from(doc.fonts ?? []).map((f) => f.load().catch(() => null));
  const go = () => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    setTimeout(() => iframe.remove(), 2000);
  };
  // wait for fonts so Indic text shapes correctly
  Promise.all(loads).then(() => doc.fonts?.ready).then(() => setTimeout(go, 150));
}

/** Word-compatible .doc (HTML with Office namespaces) — opens in Word, Pages, Google Docs. */
export function docBlob(script: Script) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(script.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${SCREENPLAY_CSS.replace(/(\d(?:\.\d+)?)in/g, '$1in')}
@page Section1 { size: 8.5in 11in; margin: 1in 1in 1in 1.5in; } body { padding-left: 0; } .heading .num { position: static; } div.Section1 { page: Section1; }
.title-page { height: auto; }</style></head>
<body><div class="Section1">${scriptHTML(script)}</div></body></html>`;
  return new Blob(['﻿', html], { type: 'application/msword' });
}

/** Fountain plain-text screenplay — imports into Scrite, Final Draft, Highland, WriterDuet, Celtx. */
export function toFountain(script: Script): string {
  const t = script.titlePage;
  const tp = [
    `Title: ${t.title || script.title}`,
    t.writtenBy && `Credit: Written by\nAuthor: ${t.writtenBy}`,
    t.basedOn && `Source: ${t.basedOn}`,
    t.draftDate && `Draft date: ${t.draftDate}`,
    t.contact && `Contact:\n${t.contact.split('\n').map((l) => '    ' + l).join('\n')}`,
  ].filter(Boolean).join('\n');
  const body = script.scenes.map((s, i) => {
    const h = s.heading.trim() || 'UNTITLED SCENE';
    // Fountain needs INT/EXT or a leading "." to force a scene heading
    const heading = /^(INT|EXT|EST|I\/E)/i.test(h) ? h.toUpperCase() : '.' + h;
    const lines = [`${heading} #${i + 1}#`, ''];
    for (const b of s.blocks) {
      const text = b.text.trim();
      if (!text) continue;
      switch (b.type) {
        case 'character': lines.push('', '@' + text.toUpperCase()); break;
        case 'parenthetical': lines.push(text.startsWith('(') ? text : `(${text})`); break;
        case 'dialogue': lines.push(text); break;
        case 'transition': lines.push('', '> ' + text.toUpperCase(), ''); break;
        // "!" forces action only when the line would otherwise look like a character cue
        default: lines.push('', /^[^a-z]*[A-Z][^a-z]*$/.test(text) ? '!' + text : text, '');
      }
    }
    if (s.synopsis) lines.splice(1, 0, `= ${s.synopsis}`);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  });
  return tp + '\n\n' + body.join('\n\n') + '\n';
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function breakdownCSV(script: Script, cal: Settings['calibration']): string {
  const rows = breakdown(script, cal);
  const head = ['Scene', 'INT/EXT', 'Location', 'Day/Night', 'Pages', 'Characters', 'Cast count', 'Synopsis', 'Voice memos', 'Photos'];
  const body = rows.map((r) => [r.scene, r.intExt, r.location, r.time, r.pages, r.characters.join('; '), r.characters.length, r.synopsis, r.memos, r.photos]);
  return '﻿' + [head, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Clean plain-text rendering of scenes for WhatsApp. */
export function toPlainText(script: Script, sceneIds?: string[]): string {
  return script.scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !sceneIds || sceneIds.includes(s.id))
    .map(({ s, i }) => {
      const out = [`*${i + 1}. ${s.heading.toUpperCase() || 'UNTITLED SCENE'}*`, ''];
      for (const b of s.blocks) {
        const t = b.text.trim();
        if (!t) continue;
        if (b.type === 'character') out.push(`          *${cueName(t).toUpperCase()}*${t.includes('(') ? ' ' + t.slice(t.indexOf('(')) : ''}`);
        else if (b.type === 'parenthetical') out.push(`       _${t.startsWith('(') ? t : `(${t})`}_`);
        else if (b.type === 'dialogue') out.push(`     ${t}`, '');
        else if (b.type === 'transition') out.push(`${t.toUpperCase()}`, '');
        else out.push(t, '');
      }
      return out.join('\n').trim();
    })
    .join('\n\n────────\n\n');
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export const safeName = (s: string) => (s.trim() || 'script').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60);

/** WhatsApp share: native share sheet with a file when supported, otherwise wa.me link with text. */
export async function shareToWhatsApp(script: Script, sceneIds?: string[]) {
  const text = toPlainText(script, sceneIds);
  const title = script.title;
  const file = new File([text], safeName(title) + '.txt', { type: 'text/plain' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share) {
    try {
      if (nav.canShare?.({ files: [file] }) && text.length > 3000) await nav.share({ files: [file], title });
      else await nav.share({ text, title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = 'https://wa.me/?text=' + encodeURIComponent(text.slice(0, 6000));
  window.open(url, '_blank', 'noopener');
  return 'link';
}
