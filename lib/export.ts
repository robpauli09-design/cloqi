import 'server-only';
// Learning material (Markdown) → PDF, Word, PowerPoint, Anki/Quizlet, Excel. All built on the server, nothing leaves CLOQI.
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, PageBreak, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import PptxGenJS from 'pptxgenjs';
import PdfPrinter from 'pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';
import { ARTEN, materialInfo, type Art, type Format } from './lernmaterial-meta';
import { inline, parseMarkdown, plain, type Block } from './md-blocks';

const GREEN = '286B24', DEEP = '19451F', LEAF = '7CC51B', SOFT = 'EDF6E3', INK = '191A17', FAINT = '8B8E84';

export interface Exported { body: Buffer; mime: string; ext: string }

/** Lösungen/Solutions headings – for "ohne Lösungen" and a page break before them. */
const isSolutions = (b: Block) => b.t === 'h' && /^(lösung|loesung|antwort|solution)/i.test(plain(b.text));

function withoutSolutions(blocks: Block[]): Block[] {
  const i = blocks.findIndex(isSolutions);
  return i < 0 ? blocks : blocks.slice(0, i);
}

/** The header line ("> **Übungstest** · Mathe · 24.11.2026") becomes a small subtitle. */
function split(markdown: string) {
  const info = materialInfo(markdown);
  let blocks = parseMarkdown(markdown);
  const subtitle = blocks[0]?.t === 'quote' && info ? plain(blocks[0].text) : null;
  if (subtitle) blocks = blocks.slice(1);
  // the first "# Title" is the document title (cover/heading), not a section of its own
  const first = blocks[0];
  const heading = first?.t === 'h' && first.level === 1 ? plain(first.text) : null;
  if (heading) blocks = blocks.slice(1);
  return { info, blocks, subtitle, heading };
}

export async function exportMaterial(markdown: string, fileTitle: string, format: Format, opts: { solutions?: boolean } = {}): Promise<Exported> {
  const { info, blocks: all, subtitle, heading } = split(markdown);
  const title = heading ?? fileTitle;
  const blocks = opts.solutions === false ? withoutSolutions(all) : all;
  switch (format) {
    case 'md': return { body: Buffer.from(markdown, 'utf8'), mime: 'text/markdown; charset=utf-8', ext: 'md' };
    case 'anki': return { body: Buffer.from(cards(all, '\t'), 'utf8'), mime: 'text/plain; charset=utf-8', ext: 'txt' };
    case 'csv': return { body: Buffer.from('﻿' + cards(all, ';', true), 'utf8'), mime: 'text/csv; charset=utf-8', ext: 'csv' };
    case 'docx': return { body: await toDocx(title, subtitle, blocks), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
    case 'pptx': return { body: await toPptx(title, subtitle, blocks, info?.art), mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' };
    case 'pdf': return { body: await toPdf(title, subtitle, blocks), mime: 'application/pdf', ext: 'pdf' };
  }
}

// ---------- cards (Anki/Quizlet: tab separated; Excel: ; separated with header) ----------
function cards(blocks: Block[], sep: string, header = false): string {
  const clean = (s: string) => plain(s).replace(/[\t\n\r]+/g, ' ').trim();
  const q = (s: string) => (sep === ';' && /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows: string[][] = [];
  let head: string[] | null = null;
  for (const b of blocks) {
    if (b.t !== 'table' || !b.rows.length) continue;
    const [first, ...rest] = b.rows;
    head ??= first;
    rows.push(...rest);
  }
  // no table: use "- **Begriff**: Erklärung" list items
  if (!rows.length) for (const b of blocks) if (b.t === 'list') for (const it of b.items) {
    const m = it.text.match(/^\*\*(.+?)\*\*\s*[:–-]\s*(.+)$/);
    if (m) rows.push([m[1], m[2]]);
  }
  const lines = rows.map(r => (sep === '\t' ? [r[0] ?? '', r.slice(1).filter(Boolean).join(' – ')] : r).map(c => q(clean(c))).join(sep));
  return [...(header && head ? [head.map(c => q(clean(c))).join(sep)] : []), ...lines].join('\r\n') + '\r\n';
}

// ---------- Word ----------
function runs(text: string, base: { bold?: boolean; color?: string; size?: number } = {}) {
  return inline(text).map(i => new TextRun({ text: i.text, bold: base.bold || i.bold, italics: i.italic, color: base.color, size: base.size }));
}
async function toDocx(title: string, subtitle: string | null, blocks: Block[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, color: DEEP, bold: true })] }),
    ...(subtitle ? [new Paragraph({ children: [new TextRun({ text: subtitle, color: FAINT, size: 20 })], spacing: { after: 240 } })] : []),
  ];
  for (const b of blocks) {
    if (b.t === 'h') {
      if (isSolutions(b)) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.min(b.level, 3)], children: runs(b.text, { color: GREEN }) }));
    } else if (b.t === 'p') children.push(new Paragraph({ children: runs(b.text), spacing: { after: 120 } }));
    else if (b.t === 'quote') children.push(new Paragraph({ children: runs(b.text, { color: FAINT }), indent: { left: 360 } }));
    else if (b.t === 'hr') children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E6E4DA', space: 1 } } }));
    else if (b.t === 'list') for (const it of b.items) {
      const text = it.check === undefined ? it.text : `☐ ${it.text}`;
      children.push(new Paragraph({ children: runs(text), numbering: { reference: b.ordered ? 'num' : 'bullet', level: it.level } }));
    } else if (b.t === 'table') {
      const cols = Math.max(...b.rows.map(r => r.length));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: b.rows.map((r, ri) => new TableRow({
          tableHeader: ri === 0,
          children: Array.from({ length: cols }, (_, ci) => new TableCell({
            shading: ri === 0 ? { type: ShadingType.CLEAR, color: 'auto', fill: SOFT } : undefined,
            children: [new Paragraph({ children: runs(r[ci] ?? '', { bold: ri === 0 }) })],
          })),
        })),
      }));
      children.push(new Paragraph({ text: '' }));
    }
  }
  const levels = (fmt: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string) =>
    [0, 1, 2, 3].map(l => ({ level: l, format: fmt, text: text(l), alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 * (l + 1), hanging: 260 } } } }));
  const doc = new Document({
    creator: 'CLOQI', title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22, color: INK } } } },
    numbering: { config: [
      { reference: 'bullet', levels: levels(LevelFormat.BULLET, l => ['•', '◦', '▪', '–'][l]) },
      { reference: 'num', levels: levels(LevelFormat.DECIMAL, l => `%${l + 1}.`) },
    ] },
    sections: [{ children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ---------- PowerPoint ----------
async function toPptx(title: string, subtitle: string | null, blocks: Block[], art?: Art): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  const cover = pptx.addSlide();
  cover.background = { color: DEEP };
  cover.addText(title, { x: 0.7, y: 2.4, w: 11.9, h: 1.4, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: 'Calibri' });
  if (subtitle) cover.addText(subtitle, { x: 0.7, y: 3.8, w: 11.9, h: 0.6, fontSize: 18, color: 'A4D92D', fontFace: 'Calibri' });

  // one slide per ## heading (a mind map: one slide per main branch)
  type Slide = { title: string; blocks: Block[] };
  const slides: Slide[] = [];
  let cur: Slide | null = null;
  const mindmap = art === 'mindmap';
  for (const b of blocks) {
    if (b.t === 'h' && b.level <= 2) { cur = { title: plain(b.text), blocks: [] }; slides.push(cur); continue; }
    if (mindmap && b.t === 'list') {
      // each top-level branch with its children becomes a slide
      let branch: Slide | null = null;
      for (const it of b.items) {
        if (it.level === 0) { branch = { title: plain(it.text), blocks: [{ t: 'list', ordered: false, items: [] }] }; slides.push(branch); continue; }
        (branch?.blocks[0] as Extract<Block, { t: 'list' }> | undefined)?.items.push({ ...it, level: it.level - 1 });
      }
      continue;
    }
    if (!cur) { cur = { title, blocks: [] }; slides.push(cur); }
    cur.blocks.push(b);
  }
  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: LEAF } });
    slide.addText(s.title, { x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 30, bold: true, color: DEEP, fontFace: 'Calibri' });
    const table = s.blocks.find(b => b.t === 'table') as Extract<Block, { t: 'table' }> | undefined;
    if (table) {
      slide.addTable(table.rows.map((r, ri) => r.map(c => ({ text: plain(c), options: ri === 0 ? { bold: true, fill: { color: SOFT } } : {} }))), {
        x: 0.6, y: 1.5, w: 12.1, fontSize: 14, fontFace: 'Calibri', color: INK, border: { type: 'solid', color: 'E6E4DA', pt: 1 }, autoPage: true,
      });
      continue;
    }
    const paras: { text: string; options: Record<string, unknown> }[] = [];
    for (const b of s.blocks) {
      if (b.t === 'list') for (const it of b.items) paras.push({ text: plain(it.text), options: { bullet: b.ordered ? { type: 'number' } : true, indentLevel: it.level, breakLine: true } });
      else if (b.t === 'p' || b.t === 'quote') paras.push({ text: plain(b.text), options: { breakLine: true } });
      else if (b.t === 'h') paras.push({ text: plain(b.text), options: { bold: true, color: GREEN, breakLine: true } });
    }
    if (paras.length) slide.addText(paras, { x: 0.6, y: 1.45, w: 12.1, h: 5.6, fontSize: 20, color: INK, fontFace: 'Calibri', valign: 'top', paraSpaceAfter: 8, fit: 'shrink' });
  }
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }) as ArrayBuffer);
}

// ---------- PDF ----------
const printer = new PdfPrinter({
  Roboto: {
    normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'), bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'), bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
});
const pdfText = (text: string) => inline(text).map(i => ({ text: i.text, bold: i.bold, italics: i.italic }));

async function toPdf(title: string, subtitle: string | null, blocks: Block[]): Promise<Buffer> {
  const content: unknown[] = [
    { text: title, fontSize: 22, bold: true, color: `#${DEEP}`, margin: [0, 0, 0, 4] },
    ...(subtitle ? [{ text: subtitle, fontSize: 9, color: `#${FAINT}`, margin: [0, 0, 0, 14] }] : []),
  ];
  for (const b of blocks) {
    if (b.t === 'h') content.push({ text: pdfText(b.text), fontSize: [0, 17, 15, 13, 12][b.level], bold: true, color: `#${GREEN}`, margin: [0, 12, 0, 5], pageBreak: isSolutions(b) ? 'before' : undefined });
    else if (b.t === 'p') content.push({ text: pdfText(b.text), margin: [0, 0, 0, 7] });
    else if (b.t === 'quote') content.push({ text: pdfText(b.text), color: `#${FAINT}`, italics: true, margin: [10, 0, 0, 7] });
    else if (b.t === 'hr') content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#E6E4DA' }], margin: [0, 6, 0, 8] });
    else if (b.t === 'list') {
      // nested lists: indent by level
      const items = b.items.map(it => ({ text: [...(it.check !== undefined ? [{ text: it.check ? '☑ ' : '☐ ' }] : []), ...pdfText(it.text)], margin: [it.level * 14, 0, 0, 2] }));
      content.push(b.ordered ? { ol: items, margin: [0, 0, 0, 8] } : b.items.some(i => i.check !== undefined) ? { stack: items, margin: [0, 0, 0, 8] } : { ul: items, margin: [0, 0, 0, 8] });
    } else if (b.t === 'table') {
      const cols = Math.max(...b.rows.map(r => r.length));
      content.push({
        table: { headerRows: 1, widths: Array(cols).fill('*'), body: b.rows.map((r, ri) => Array.from({ length: cols }, (_, ci) => ({ text: pdfText(r[ci] ?? ''), bold: ri === 0, fillColor: ri === 0 ? `#${SOFT}` : undefined }))) },
        layout: { hLineColor: () => '#E6E4DA', vLineColor: () => '#E6E4DA' }, margin: [0, 2, 0, 10],
      });
    }
  }
  const doc = printer.createPdfKitDocument({
    content, info: { title, creator: 'CLOQI' }, pageMargins: [48, 48, 48, 56],
    defaultStyle: { font: 'Roboto', fontSize: 11, color: `#${INK}`, lineHeight: 1.25 },
    footer: (page: number, pages: number) => ({ columns: [{ text: 'Erstellt mit CLOQI', color: `#${FAINT}`, fontSize: 8 }, { text: `${page} / ${pages}`, alignment: 'right', color: `#${FAINT}`, fontSize: 8 }], margin: [48, 16, 48, 0] }),
  });
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export const formatsFor = (markdown: string): Format[] => {
  const info = materialInfo(markdown);
  return info ? [...ARTEN[info.art].formats] : ['pdf', 'docx', 'md'];
};
