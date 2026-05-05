import type { ReactNode } from 'react'

/**
 * Quebra um texto em partes que casam (e não casam) com o termo buscado,
 * envolvendo as casadas em <mark>. Case-insensitive, ignora termos curtos.
 */
export function highlightMatch(text: string | null | undefined, term: string | null | undefined): ReactNode {
    if (!text) return text ?? null
    const safeTerm = (term ?? '').trim()
    if (safeTerm.length < 2) return text

    try {
        const escaped = safeTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`(${escaped})`, 'ig')
        const parts = text.split(regex)
        const lower = safeTerm.toLowerCase()
        return parts.map((part, i) =>
            part.toLowerCase() === lower
                ? <mark key={i} className="bg-amber-100 text-amber-900 rounded px-0.5">{part}</mark>
                : <span key={i}>{part}</span>
        )
    } catch {
        return text
    }
}
