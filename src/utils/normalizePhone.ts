/**
 * Espelha a função SQL sdr_normalize_phone — normaliza telefone para
 * formato 55DDDNNNNNNNN (12-13 dígitos). Retorna null se inválido.
 *
 * Aceita: "+55 11 99999-9999", "(11) 99999-9999", "11999999999", etc.
 * Sempre alinha com contatos.telefone (DDI 55 + DDD + número, só dígitos).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
    if (phone == null) return null
    let digits = String(phone).replace(/\D/g, '')
    if (!digits) return null
    if (digits.length >= 8 && digits.length <= 11) {
        digits = '55' + digits
    }
    if (digits.length < 12 || digits.length > 13) return null
    return digits
}

export function formatPhoneBR(phone: string | null | undefined): string {
    const norm = normalizePhone(phone)
    if (!norm) return phone ?? ''
    const tail = norm.slice(2)
    if (tail.length === 11) {
        return `+55 (${tail.slice(0, 2)}) ${tail.slice(2, 7)}-${tail.slice(7)}`
    }
    if (tail.length === 10) {
        return `+55 (${tail.slice(0, 2)}) ${tail.slice(2, 6)}-${tail.slice(6)}`
    }
    return `+${norm}`
}
