// pdfmake 0.2 ships without TypeScript types; CLOQI only uses the Node printer (lib/export.ts).
declare module 'pdfmake' {
  const PdfPrinter: new (fonts: Record<string, Record<string, Buffer>>) => {
    createPdfKitDocument(doc: unknown): NodeJS.ReadableStream & { end(): void };
  };
  export default PdfPrinter;
}
declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}
