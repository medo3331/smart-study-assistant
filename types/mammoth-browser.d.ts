// types/mammoth-browser.d.ts
// @ts-self — `mammoth/mammoth.browser` نسخة المتصفح مش عليها types.
declare module "mammoth/mammoth.browser" {
  export interface ConvertResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function convertToHtml(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<ConvertResult>;
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<ConvertResult>;
}
