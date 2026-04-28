import { extractTextFromPdf } from '../pdf-extract';

jest.mock('../image-ocr', () => ({
  extractTextFromImage: jest.fn(),
}));

import { extractTextFromImage } from '../image-ocr';

const mockExtractTextFromImage = extractTextFromImage as jest.MockedFunction<typeof extractTextFromImage>;

describe('extractTextFromPdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to image OCR for PDF content (no PDF lib in deps)', async () => {
    mockExtractTextFromImage.mockResolvedValue(
      'CARGO: 5000 MT WHEAT\nLOAD PORT: NOVOROSSIYSK\nDISCHARGE: ALEXANDRIA',
    );

    const pdfBuffer = Buffer.from('%PDF-1.4 mock content');
    const result = await extractTextFromPdf(pdfBuffer);

    expect(result).toBe(
      'CARGO: 5000 MT WHEAT\nLOAD PORT: NOVOROSSIYSK\nDISCHARGE: ALEXANDRIA',
    );
    expect(mockExtractTextFromImage).toHaveBeenCalledTimes(1);
  });

  it('accepts string (base64) input', async () => {
    mockExtractTextFromImage.mockResolvedValue('extracted from base64');

    const base64Content = Buffer.from('%PDF-1.4 mock').toString('base64');
    const result = await extractTextFromPdf(base64Content);

    expect(result).toBe('extracted from base64');
  });

  it('returns empty string when OCR fails', async () => {
    mockExtractTextFromImage.mockResolvedValue('');

    const result = await extractTextFromPdf(Buffer.from('bad pdf'));

    expect(result).toBe('');
  });
});
