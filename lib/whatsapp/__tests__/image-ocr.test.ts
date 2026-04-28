import { extractTextFromImage } from '../image-ocr';

jest.mock('@/lib/openai', () => ({
  callAiText: jest.fn(),
}));

import { callAiText } from '@/lib/openai';

const mockCallAiText = callAiText as jest.MockedFunction<typeof callAiText>;

describe('extractTextFromImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls Vision API via ClipProxy and returns extracted text', async () => {
    mockCallAiText.mockResolvedValue(
      'MV ATLAS HANDY\n7,500 MT STEEL COILS\nISTANBUL → LAGOS\nLAYCAN 10-15 MAY',
    );

    const result = await extractTextFromImage('https://example.com/media/screenshot.jpg');

    expect(result).toBe(
      'MV ATLAS HANDY\n7,500 MT STEEL COILS\nISTANBUL → LAGOS\nLAYCAN 10-15 MAY',
    );
    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    // Verify the prompt instructs to extract text only
    const callArgs = mockCallAiText.mock.calls[0];
    expect(callArgs[0]).toContain('image');
    expect(callArgs[1]).toContain('Extract all text');
  });

  it('returns empty string on API failure', async () => {
    mockCallAiText.mockResolvedValue('');

    const result = await extractTextFromImage('https://example.com/media/broken.jpg');

    expect(result).toBe('');
  });
});
