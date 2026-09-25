import type { ImportedProcess } from "./model";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("kloqi-imports", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("processes", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Der lokale Datenspeicher ist nicht verfügbar."));
  });
}
export async function listImports(owner: string): Promise<ImportedProcess[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("processes", "readonly");
    const request = tx.objectStore("processes").getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as ImportedProcess[])
          .filter((p) => p.owner === owner)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    request.onerror = () =>
      reject(new Error("Importe konnten nicht geladen werden."));
    tx.oncomplete = () => db.close();
  });
}
export async function saveImport(process: ImportedProcess) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("processes", "readwrite");
    tx.objectStore("processes").put(process);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "Speichern fehlgeschlagen. Möglicherweise ist der Browserspeicher voll. Deine Vorschau bleibt erhalten.",
        ),
      );
    };
  });
}
