import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractTextFromFile, detectFileKind, ExtractError } from '../extract-text';

describe('extract-text', () => {
  it('extracts text from a valid PDF', async () => {
    const pdfPath = path.resolve(process.cwd(), 'workspace', 'cufe-cce-en.pdf');
    const buffer = fs.readFileSync(pdfPath);
    const file = new File([buffer], 'cufe-cce-en.pdf', { type: 'application/pdf' });
    const text = await extractTextFromFile(file, { maxFileBytes: 50 * 1024 * 1024, maxImageBytes: 1 * 1024 * 1024, maxTextChars: 1000 });
    expect(typeof text).toBe('string');
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('throws ExtractError for a corrupted PDF', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'broken.pdf', { type: 'application/pdf' });
    await expect(extractTextFromFile(file, { maxFileBytes: 1024, maxImageBytes: 1024, maxTextChars: 100 })).rejects.toBeInstanceOf(ExtractError);
  });

  it('throws ExtractError for unsupported file types', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'data.bin', { type: 'application/octet-stream' });
    await expect(extractTextFromFile(file, { maxFileBytes: 1024, maxImageBytes: 1024, maxTextChars: 100 })).rejects.toBeInstanceOf(ExtractError);
  });

  it('detects file kinds', () => {
    expect(detectFileKind('application/pdf', 'a.pdf')).toBe('pdf');
    expect(detectFileKind('text/plain', 'a.txt')).toBe('text');
    expect(detectFileKind('application/octet-stream', 'a.bin')).toBeNull();
  });
});
