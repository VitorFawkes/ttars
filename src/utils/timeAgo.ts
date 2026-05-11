/**
 * Formata diferença de tempo entre uma data e agora em pt-BR.
 * Ex: "agora há pouco", "há 5 min", "há 2h", "há 3 dias", "11/05 14:32"
 */
export function timeAgo(iso: string | Date | null | undefined): string {
    if (!iso) return ''
    const date = typeof iso === 'string' ? new Date(iso) : iso
    if (isNaN(date.getTime())) return ''
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return 'agora há pouco'
    if (diffMin < 60) return `há ${diffMin} min`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `há ${diffH}h`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7) return `há ${diffD} ${diffD === 1 ? 'dia' : 'dias'}`
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
        ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
