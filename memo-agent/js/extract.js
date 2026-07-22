import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

async function extractPdf(file) {
  const buf = await file.arrayBuffer();
  const standardFontDataUrl = new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href;
  const doc = await pdfjsLib.getDocument({ data: buf, standardFontDataUrl }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    pages.push(text);
  }
  const text = pages.join('\n\n');
  if (text.replace(/\s+/g, '').length < 50) {
    throw new Error(file.name + ': no readable text — this PDF appears to be scanned/image-only. Attach the PDF directly in your claude.ai chat alongside the prompt (Claude reads PDFs visually), or use "Paste text instead" to add its contents here.');
  }
  return text;
}

async function extractDocx(file) {
  const buf = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

function extractPlainText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read ' + file.name));
    reader.readAsText(file);
  });
}

export async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractPdf(file);
  if (name.endsWith('.docx')) return extractDocx(file);
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv')) return extractPlainText(file);
  if (name.endsWith('.doc')) {
    throw new Error(name + ': old .doc format is not supported. Please save it as .docx or .pdf and re-upload.');
  }
  throw new Error(name + ': unsupported file type. Use PDF, DOCX, TXT, MD, or CSV.');
}
