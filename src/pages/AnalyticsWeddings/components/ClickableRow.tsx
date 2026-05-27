import type { ReactNode, KeyboardEvent } from 'react'

type Props = {
  onClick: () => void
  children: ReactNode
  className?: string
  title?: string
}

/**
 * Linha de tabela clicável com suporte a teclado (Enter/Space) e
 * indicador visual de hover. Usar para drill-down.
 */
export function ClickableRow({ onClick, children, className = '', title }: Props) {
  const handleKey = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKey}
      title={title}
      className={`cursor-pointer hover:bg-indigo-50/60 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-indigo-50/60 transition-colors ${className}`}
    >
      {children}
    </tr>
  )
}
