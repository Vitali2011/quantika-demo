import { extractTextFromImage } from './image-ocr';

/**
 * Extracts text from a PDF buffer or base64 string.
 * No PDF parsing library in deps — falls back to Vision API OCR via image-ocr module.
 */
export async function extractTextFromPdf(pdfBuffer: Buffer | string): Promise<string> {
  const base64 =
    typeof pdfBuffer === 'string'
      ? pdfBuffer
      : pdfBuffer.toString('base64');

  const dataUri = `data:application/pdf;base64,${base64}`;
  return extractTextFromImage(dataUri);
}
