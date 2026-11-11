// Reads the paragraphs of a Word file (.docx) in the browser, without libraries.
// A .docx is a zip archive; the text lives in word/document.xml.

async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

async function readEntry(buf, wanted) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory record
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige Word-Datei.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const lNameLen = v.getUint16(local + 26, true);
      const lExtraLen = v.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + csize);
      return dec.decode(method === 0 ? data : await inflate(data));
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

export async function extractDocx(data) {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const xml = await readEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('Keine gültige Word-Datei.');
  const rels = (await readEntry(buf, 'word/_rels/document.xml.rels')) || '';
  const relMap = Object.fromEntries([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], unescape(m[2])]));
  const lines = [];
  const links = [];
  for (const para of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    let text = '';
    for (const m of para.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) text += m[1] !== undefined ? unescape(m[1]) : ' ';
    // Hyperlinks whose visible text is not the URL ("Video" linked to Vimeo)
    for (const h of para.matchAll(/<w:hyperlink[^>]*r:id="([^"]+)"/g)) {
      const url = relMap[h[1]];
      if (url && /^https?:/.test(url)) {
        links.push({ url, page: 0 });
        if (!text.includes(url)) text = /^\s*Video:?\s*$/i.test(text) ? `Video: ${url}` : text;
      }
    }
    for (const t of text.split(/\n/)) if (t.trim()) lines.push({ text: t.trim(), page: 0 });
  }
  return { lines, links, pages: 0 };
}
