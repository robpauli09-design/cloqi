import { makeTable, parseCSV } from "./model";
import type { TableSource, KnowledgeSource } from "./model";
export const MAX_FILE_SIZE = 8 * 1024 * 1024;
export function validateZipSize(buffer: ArrayBuffer) {
  const v = new DataView(buffer);
  let total = 0,
    entries = 0;
  for (let i = 0; i <= v.byteLength - 46; i++)
    if (v.getUint32(i, true) === 0x02014b50) {
      const size = v.getUint32(i + 24, true);
      total += size;
      entries++;
      if (total > 40 * 1024 * 1024 || entries > 3000)
        throw new Error(
          "Die entpackte Datei ist zu groß. Bitte eine kleinere Datei exportieren.",
        );
      i +=
        45 +
        v.getUint16(i + 28, true) +
        v.getUint16(i + 30, true) +
        v.getUint16(i + 32, true);
    }
  if (!entries)
    throw new Error(
      "Die Office-Datei ist beschädigt oder nicht im unterstützten Format.",
    );
}
export async function parseImportFile(
  file: File,
): Promise<{ tables: TableSource[]; knowledge: KnowledgeSource[] }> {
  if (file.size > MAX_FILE_SIZE) throw new Error("Maximal 8 MB pro Datei.");
  if (!file.size) throw new Error("Die Datei ist leer.");
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (ext === "csv")
    return {
      tables: [makeTable(file.name, parseCSV(await file.text()))],
      knowledge: [],
    };
  if (ext === "json") {
    const data = JSON.parse(await file.text());
    if (
      !Array.isArray(data) ||
      !data.length ||
      data.some((r) => !r || typeof r !== "object" || Array.isArray(r))
    )
      throw new Error(
        "JSON muss eine Liste von Objekten mit einfachen Feldwerten enthalten.",
      );
    const headers = [...new Set(data.flatMap((r) => Object.keys(r)))];
    if (
      data.some((r) =>
        Object.values(r).some((v) => v !== null && typeof v === "object"),
      )
    )
      throw new Error(
        "Verschachtelte JSON-Werte bitte vor dem Import als flache Tabelle exportieren.",
      );
    return {
      tables: [
        makeTable(file.name, [
          headers,
          ...data.map((r) => headers.map((h) => String(r[h] ?? ""))),
        ]),
      ],
      knowledge: [],
    };
  }
  if (ext === "xlsx") {
    const buffer = await file.arrayBuffer();
    validateZipSize(buffer);
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const tables: TableSource[] = [];
    for (const sheet of book.worksheets) {
      if (sheet.state !== "visible") continue;
      if (sheet.rowCount > 10001 || sheet.columnCount > 80)
        throw new Error("Maximal 10.000 Zeilen und 80 Spalten pro Blatt.");
      const rows: string[][] = [];
      sheet.eachRow((row) => {
        const values: string[] = [];
        for (let i = 1; i <= sheet.columnCount; i++) {
          const cell = row.getCell(i);
          values.push(
            cell.value instanceof Date ? cell.value.toISOString() : cell.text,
          );
        }
        rows.push(values);
      });
      if (rows.length > 1)
        tables.push(makeTable(`${file.name} · ${sheet.name}`, rows));
    }
    if (!tables.length)
      throw new Error(
        "Keine sichtbare Tabelle mit Kopfzeile und Daten gefunden.",
      );
    return { tables, knowledge: [] };
  }
  let text = "";
  if (ext === "txt") text = await file.text();
  else if (ext === "docx") {
    const arrayBuffer = await file.arrayBuffer();
    validateZipSize(arrayBuffer);
    const { default: mammoth } = await import("mammoth/mammoth.browser.js");
    text = (await mammoth.extractRawText({ arrayBuffer })).value;
  } else if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    const { default: worker } =
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const task = pdfjs.getDocument({
      data: await file.arrayBuffer(),
      useSystemFonts: false,
      enableXfa: false,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 100)
        throw new Error(
          "Maximal 100 PDF-Seiten. Bitte das Dokument aufteilen.",
        );
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        text +=
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ") + "\n";
        if (text.length > 200000)
          throw new Error("Maximal 200.000 Zeichen pro Dokument.");
      }
    } finally {
      await task.destroy();
    }
  } else
    throw new Error(
      ext === "xls"
        ? "Bitte die alte XLS-Datei als XLSX oder CSV speichern."
        : "Unterstützt werden CSV, XLSX, JSON, PDF, DOCX und TXT.",
    );
  if (!text.trim())
    throw new Error(
      "Kein lesbarer Text gefunden. Gescannte PDFs benötigen zuerst eine Texterkennung (OCR).",
    );
  if (text.length > 200000)
    throw new Error("Maximal 200.000 Zeichen pro Dokument.");
  return {
    tables: [],
    knowledge: [
      { id: crypto.randomUUID(), name: file.name, text: text.trim() },
    ],
  };
}
