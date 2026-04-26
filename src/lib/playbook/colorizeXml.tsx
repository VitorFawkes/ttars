import { Fragment, type ReactNode } from 'react'

const TAG_RE = /(<\/?[a-zA-Z_][\w-]*(?:\s+[^>]*)?\/?>)/g
const ATTR_RE = /([a-zA-Z_][\w-]*)=("[^"]*"|'[^']*')/g

function colorizeOneTag(tag: string, key: number): ReactNode {
  const match = tag.match(/^<\/?([a-zA-Z_][\w-]*)/)
  const tagName = match?.[1] ?? ''
  const isClosing = tag.startsWith('</')
  const isSelfClose = tag.endsWith('/>')

  const open = isClosing ? '</' : '<'
  const close = isSelfClose ? '/>' : '>'

  const inner = tag.slice(open.length, tag.length - close.length)
  const afterName = inner.slice(tagName.length)

  const attrParts: ReactNode[] = []
  let lastIdx = 0
  let attrKey = 0
  for (const m of afterName.matchAll(ATTR_RE)) {
    if (m.index === undefined) continue
    if (m.index > lastIdx) attrParts.push(afterName.slice(lastIdx, m.index))
    attrParts.push(
      <Fragment key={`a-${attrKey++}`}>
        <span className="text-sky-300">{m[1]}</span>
        <span className="text-slate-400">=</span>
        <span className="text-emerald-300">{m[2]}</span>
      </Fragment>,
    )
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < afterName.length) attrParts.push(afterName.slice(lastIdx))

  return (
    <span key={key} className="text-pink-400">
      {open}
      <span className="text-pink-300 font-semibold">{tagName}</span>
      {attrParts}
      {close}
    </span>
  )
}

/**
 * Coloriza XML de forma simples (regex, sem dependência externa).
 * Tags em rosa, nomes de tag mais brilhantes, atributos em azul/verde, texto em branco/cinza.
 * Pensado pro prompt do agente que usa XML pra estruturar blocos.
 */
export function colorizeXml(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  let lastIdx = 0
  let key = 0
  for (const m of text.matchAll(TAG_RE)) {
    if (m.index === undefined) continue
    if (m.index > lastIdx) {
      parts.push(
        <span key={key++} className="text-slate-100">
          {text.slice(lastIdx, m.index)}
        </span>,
      )
    }
    parts.push(colorizeOneTag(m[0], key++))
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) {
    parts.push(
      <span key={key++} className="text-slate-100">
        {text.slice(lastIdx)}
      </span>,
    )
  }
  return parts
}
