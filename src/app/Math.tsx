import katex from 'katex'
import 'katex/dist/katex.min.css'

export function InlineMath({ children }: { children: string }) {
  const html = katex.renderToString(children, {
    throwOnError: false,
  })
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

export function BlockMath({ children }: { children: string }) {
  const html = katex.renderToString(children, {
    displayMode: true,
    throwOnError: false,
  })
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
