// Extracts plain text lines (and link URLs) from a PDF, page by page.
// Works in the browser and in Node, the caller passes the pdf.js module.

export async function extractPdf(pdfjsLib, data) {
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const lines = [];
  const links = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let current = '';
    let lastY = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform ? Math.round(item.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3 && current.trim()) {
        lines.push({ text: current.trim(), page: p });
        current = '';
      }
      current += item.str;
      lastY = y;
      if (item.hasEOL) {
        if (current.trim()) lines.push({ text: current.trim(), page: p });
        current = '';
        lastY = null;
      }
    }
    if (current.trim()) lines.push({ text: current.trim(), page: p });
    try {
      const annots = await page.getAnnotations();
      for (const a of annots) if (a.url) links.push({ url: a.url, page: p });
    } catch (e) { /* annotations are optional */ }
  }
  return { lines, links, pages: doc.numPages };
}
