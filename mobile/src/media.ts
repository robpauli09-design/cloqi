import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

// Photos and PDFs for CLOQI AI – same limits as the website (app/(app)/ai/Chat.tsx).
export interface Attachment { name: string; mime: string; data: string; preview?: string }
export const MAX_FILES = 4;
const MAX_SIDE = 1600;

/** Local file → base64 (native: expo-file-system; web preview: fetch + FileReader). */
export async function readBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') return new File(uri).base64();
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    r.readAsDataURL(blob);
  });
}

/** Scales a photo down (max 1600 px) and compresses it to JPEG. */
async function shrink(asset: ImagePicker.ImagePickerAsset, index: number): Promise<Attachment> {
  const big = Math.max(asset.width, asset.height) > MAX_SIDE;
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (big) ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const img = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!img.base64) throw new Error('Foto konnte nicht gelesen werden.');
  const base = (asset.fileName ?? `Foto ${index + 1}`).replace(/\.[^.]+$/, '');
  return { name: `${base}.jpg`, mime: 'image/jpeg', data: img.base64, preview: img.uri };
}

/** Opens the camera. Returns null when cancelled; throws with a German message when access is denied. */
export async function takePhoto(): Promise<Attachment[] | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Bitte erlaube CLOQI den Zugriff auf die Kamera (Einstellungen).');
  const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (r.canceled || !r.assets?.length) return null;
  return Promise.all(r.assets.slice(0, 1).map(shrink));
}

export async function pickPhotos(limit: number): Promise<Attachment[] | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, quality: 1 });
  if (r.canceled || !r.assets?.length) return null;
  return Promise.all(r.assets.slice(0, limit).map(shrink));
}

export async function pickFiles(limit: number): Promise<Attachment[] | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  const out: Attachment[] = [];
  for (const [i, a] of r.assets.slice(0, limit).entries()) {
    const mime = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    if (mime === 'application/pdf') {
      if ((a.size ?? 0) > 3 * 1024 * 1024) throw new Error('Das PDF ist zu groß (max. 3 MB).');
      out.push({ name: a.name, mime, data: await readBase64(a.uri) });
    } else if (mime.startsWith('image/')) {
      const probe = await ImageManipulator.manipulate(a.uri).renderAsync();
      out.push(await shrink({ uri: a.uri, width: probe.width, height: probe.height, fileName: a.name } as ImagePicker.ImagePickerAsset, i));
    } else {
      throw new Error('Nur Fotos und PDFs werden unterstützt.');
    }
  }
  return out;
}
