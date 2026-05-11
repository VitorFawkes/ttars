/**
 * Paleta de cores para identificação de consultores no team view do calendário.
 * Cores evitam conflito com STATUS_COLORS (blue, green, red, amber, gray).
 */
export const USER_COLOR_PALETTE = [
    { bg: 'bg-violet-500', text: 'text-white' },
    { bg: 'bg-pink-500', text: 'text-white' },
    { bg: 'bg-teal-500', text: 'text-white' },
    { bg: 'bg-orange-500', text: 'text-white' },
    { bg: 'bg-cyan-600', text: 'text-white' },
    { bg: 'bg-rose-500', text: 'text-white' },
    { bg: 'bg-emerald-600', text: 'text-white' },
    { bg: 'bg-fuchsia-500', text: 'text-white' },
    { bg: 'bg-sky-500', text: 'text-white' },
    { bg: 'bg-lime-600', text: 'text-white' },
] as const

/** Hash determinístico do UUID → índice consistente na paleta */
function hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
}

export function getUserColor(userId: string) {
    const index = hashString(userId) % USER_COLOR_PALETTE.length
    return USER_COLOR_PALETTE[index]
}
