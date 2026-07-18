import { MarkdownTextPrimitive, type CodeHeaderProps } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

function CodeHeader({ language, code }: CodeHeaderProps) {
  const [copied, setCopied] = useState(false)
  const copy = () => { if (code) { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } }
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-haze-300 bg-white/[0.03] border-b border-white/5 rounded-t-lg">
      <span className="lowercase tracking-wide">{language || 'text'}</span>
      <button onClick={copy} className="flex items-center gap-1 hover:text-haze-100 transition" aria-label="Copy code">
        {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

// Syntax-highlighted code blocks; wraps long lines (no horizontal scroll).
function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <SyntaxHighlighter
      language={language || 'text'}
      style={oneDark}
      customStyle={{ margin: 0, borderRadius: '0 0 8px 8px', fontSize: '12.5px', background: '#0e0e12' }}
      wrapLongLines
      PreTag="div"
    >
      {code}
    </SyntaxHighlighter>
  )
}

// Renders assistant text as GitHub-flavored markdown with smooth streaming and
// syntax-highlighted code. `smooth` animates incoming tokens.
export function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      smooth
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={{
        SyntaxHighlighter: CodeBlock as any,
        CodeHeader,
      }}
    />
  )
}
