import type { SVGProps } from 'react'

/**
 * Concierge service bell — substitui o ícone Headphones no menu lateral
 * e nos selos de tarefas Concierge.
 *
 * API espelha Lucide (`width`/`height` via props, cor via `currentColor`),
 * então funciona em qualquer lugar que aceite um Lucide icon como prop.
 */
export function BellConciergeIcon({
  width = 24,
  height = 24,
  ...rest
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M3 20a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1Zm17-4a8 8 0 1 0-16 0m8-12v4m-2-4h4" />
    </svg>
  )
}
