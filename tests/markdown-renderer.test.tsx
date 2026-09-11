import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MarkdownRenderer } from '../components/ui/MarkdownRenderer'

describe('MarkdownRenderer (KaTeX + RTL + streaming)', () => {
  it('renders inline math with $...$', () => {
    const html = renderToString(
      <MarkdownRenderer content="حل المعادلة $x^2 + 1 = 0$ خطوة بخطوة" />,
    )
    expect(html).toContain('katex')
    expect(html).toContain('حل المعادلة')
  })

  it('renders display math with $$...$$ on its own lines', () => {
    const html = renderToString(
      <MarkdownRenderer content={'المعادلة:\n\n$$\n\\frac{a}{b} = c\n$$\n\nانتهت.'} />,
    )
    expect(html).toContain('katex-display')
  })

  it('renders single-line $$...$$ as math too (inline fallback)', () => {
    const html = renderToString(
      <MarkdownRenderer content={'المعادلة $$x^2$$ هنا.'} />,
    )
    expect(html).toContain('katex')
  })

  it('does not crash on unclosed $$ during streaming (auto-closes)', () => {
    const html = renderToString(
      <MarkdownRenderer content={'نكمل الحل:\n\n$$\nx^2 + 2x'} />,
    )
    expect(html).toContain('katex')
  })

  it('does not crash on broken math (throwOnError: false)', () => {
    const html = renderToString(
      <MarkdownRenderer content="معادلة ناقصة $\\frac{1}$ أثناء البث" />,
    )
    expect(html).toContain('معادلة ناقصة')
  })

  it('keeps Arabic wrapper with dir="auto"', () => {
    const html = renderToString(<MarkdownRenderer content="نص عربي" />)
    expect(html).toContain('dir="auto"')
    expect(html).toContain('markdown-renderer')
  })

  it('wraps GFM tables and code blocks with LTR/overflow helpers', () => {
    const html = renderToString(
      <MarkdownRenderer
        content={'| أ | ب |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1\n```'}
      />,
    )
    expect(html).toContain('md-table-wrap')
    expect(html).toContain('md-codeblock')
    expect(html).toContain('dir="ltr"')
  })
})
