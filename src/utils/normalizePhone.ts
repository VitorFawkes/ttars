/**
 * Normaliza telefone para dígitos puros. Retorna null se inválido.
 *
 * Regra de país:
 *  - Com "+" na frente: número internacional explícito — o código do país já
 *    veio junto. Mantém os dígitos como estão, SEM prefixar 55 (faixa E.164,
 *    8–15 dígitos). Ex: "+1 415 555 0123" → "14155550123".
 *  - Sem "+": assume Brasil e prefixa 55 a números locais de 8–11 dígitos.
 *    Ex: "(11) 99999-9999" → "5511999999999".
 *
 * Para o caso BR alinha com contatos.telefone (DDI 55 + DDD + número); para
 * internacionais preserva o DDI estrangeiro intacto.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
    if (phone == null) return null
    const raw = String(phone).trim()
    const isInternational = raw.startsWith('+')
    const digits = raw.replace(/\D/g, '')
    if (!digits) return null

    if (isInternational) {
        // "+" = código do país já incluso. Nunca adiciona 55. Faixa E.164.
        if (digits.length < 8 || digits.length > 15) return null
        return digits
    }

    // Sem "+": assume Brasil e prefixa 55 a números locais.
    let br = digits
    if (br.length >= 8 && br.length <= 11) {
        br = '55' + br
    }
    if (br.length < 12 || br.length > 13) return null
    return br
}

export function formatPhoneBR(phone: string | null | undefined): string {
    const norm = normalizePhone(phone)
    if (!norm) return phone ?? ''
    // Número brasileiro: 55 + DDD + linha (12–13 dígitos).
    if (norm.startsWith('55') && (norm.length === 12 || norm.length === 13)) {
        const tail = norm.slice(2)
        if (tail.length === 11) {
            return `+55 (${tail.slice(0, 2)}) ${tail.slice(2, 7)}-${tail.slice(7)}`
        }
        if (tail.length === 10) {
            return `+55 (${tail.slice(0, 2)}) ${tail.slice(2, 6)}-${tail.slice(6)}`
        }
    }
    // Internacional: mostra com "+" e os dígitos do país.
    return `+${norm}`
}
