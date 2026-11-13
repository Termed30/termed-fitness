// Progress photos: compressed on the device and stored in IndexedDB.
import { db } from './db.js';
import { S } from './state.js';
import { uid, isoDate } from './util.js';

const urlCache = new Map();

async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall back */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function scale(img, max, quality) {
  const w = img.width;
  const h = img.height;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}

export async function savePhoto(file, meta = {}) {
  const img = await loadImage(file);
  const blob = await scale(img, 1440, 0.82);
  const thumb = await scale(img, 400, 0.75);
  const rec = { id: uid(), takenAt: Date.now(), date: isoDate(), ...meta, blob, thumb };
  await db.put('photos', rec);
  const { blob: _b, thumb: _t, ...m } = rec;
  if (m.kind === 'idol') S.idols.push(m); else S.photos.push(m);
  try { await navigator.storage?.persist?.(); } catch (e) { /* optional */ }
  return rec.id;
}

export async function photoUrl(id, which = 'thumb') {
  const key = `${id}:${which}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const rec = await db.get('photos', id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec[which] || rec.blob);
  urlCache.set(key, url);
  return url;
}

export async function deletePhoto(id) {
  await db.del('photos', id);
  S.photos = S.photos.filter((p) => p.id !== id);
  S.idols = S.idols.filter((p) => p.id !== id);
  for (const w of ['thumb', 'blob']) {
    const k = `${id}:${w}`;
    if (urlCache.has(k)) { URL.revokeObjectURL(urlCache.get(k)); urlCache.delete(k); }
  }
}

// Fills every <img data-photo="id" data-size="thumb|blob"> inside root.
export async function hydratePhotos(root = document) {
  const imgs = root.querySelectorAll('img[data-photo]');
  for (const img of imgs) {
    const url = await photoUrl(img.dataset.photo, img.dataset.size || 'thumb');
    if (url) img.src = url;
  }
}
