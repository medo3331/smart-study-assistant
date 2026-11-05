import { describe, it, expect } from 'vitest';
import { detectFileKind } from '../extract-text';

describe('extract-text module loading', () => {
  it('loads without evaluating pdfjs at module scope', async () => {
    const mod = await import('../extract-text');
    expect(typeof mod.extractTextFromFile).toBe('function');
  });

  it('detects pdf kind', () => {
    expect(detectFileKind('application/pdf', 'a.pdf')).toBe('pdf');
  });
});
