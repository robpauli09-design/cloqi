import type { ImportedProcess } from "./model";
const dbName = "cloqi-imports";
// Imports saved before the KLOQI → CLOQI rename live in this database.
const legacyDbName = "kloqi-imports";
function openRaw(name: string, onCreate?: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("processes", { keyPath: "id" });
      onCreate?.();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Der lokale Datenspeicher ist nicht verfügbar."));
  });
}
async function copyLegacyImports(db: IDBDatabase) {
  try {
    // Only look for the old database if the browser can tell us it exists;
    // opening it blindly would create an empty one.
    const known = await indexedDB.databases?.();
    if (!known?.some((entry) => entry.name === legacyDbName)) return;
    const legacy = await openRaw(legacyDbName);
    const rows = await new Promise<ImportedProcess[]>((resolve, reject) => {
      const request = legacy.transaction("processes", "readonly").objectStore("processes").getAll();
      request.onsuccess = () => resolve(request.result as ImportedProcess[]);
      request.onerror = () => reject(request.error);
    });
    legacy.close();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("processes", "readwrite");
      rows.forEach((row) => tx.objectStore("processes").put(row));
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    indexedDB.deleteDatabase(legacyDbName);
  } catch {
    /* Old imports stay in the legacy database; new imports still work. */
  }
}
async function open(): Promise<IDBDatabase> {
  let created = false;
  const db = await openRaw(dbName, () => { created = true; });
  if (created) await copyLegacyImports(db);
  return db;
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
