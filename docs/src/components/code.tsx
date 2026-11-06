import {
  CodeBlock,
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
  Pre,
} from 'fumadocs-ui/components/codeblock'
import { type JSX, useEffect, useRef, useState } from 'react'
import { messages } from '../messages'
import { highlight } from './highlight'
import { Icon } from './icon'

export function CopyButton({
  text,
  label = messages.code.copy,
}: {
  readonly text: string
  readonly label?: string
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      className="tool tool-sq"
      type="button"
      aria-label={copied ? messages.code.copied : label}
      onClick={copy}
    >
      <Icon name={copied ? 'check' : 'copy'} />
    </button>
  )
}

export function SourceCode({
  code,
  language = 'ts',
  title,
}: {
  readonly code: string
  readonly language?: string
  readonly title?: string
}): JSX.Element {
  return (
    <CodeBlock title={title} className="source-code">
      <Pre>
        <code>{highlight(code, language)}</code>
      </Pre>
    </CodeBlock>
  )
}

export interface CodeFile {
  readonly label: string
  readonly code: string
  readonly language?: string
}

export function CodeTabs({
  files,
  groupId,
}: {
  readonly files: readonly CodeFile[]
  readonly groupId?: string
}): JSX.Element {
  const first = files[0]?.label
  return (
    <CodeBlockTabs
      className="source-code"
      {...(first ? { defaultValue: first } : {})}
      {...(groupId ? { groupId, persist: true } : {})}
    >
      <CodeBlockTabsList>
        {files.map((file) => (
          <CodeBlockTabsTrigger key={file.label} value={file.label}>
            {file.label}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {files.map((file) => (
        <CodeBlockTab key={file.label} value={file.label}>
          <CodeBlock>
            <Pre>
              <code>{highlight(file.code, file.language ?? 'ts')}</code>
            </Pre>
          </CodeBlock>
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  )
}
