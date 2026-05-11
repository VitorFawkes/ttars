import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value)
}

/**
 * Normaliza telefone brasileiro removendo formatação
 * Exemplos:
 * - "(31) 99146-1394" → "31991461394"
 * - "+55 31 99146-1394" → "31991461394"
 * - "5531991461394" → "31991461394"
 */
export function normalizePhone(phone: string): string {
    // Remove tudo que não é número
    let normalized = phone.replace(/\D/g, '')

    // Remove código do país (55) se presente no início
    if (normalized.startsWith('55') && normalized.length >= 12) {
        normalized = normalized.slice(2)
    }

    return normalized
}

/**
 * Verifica se a string parece ser um telefone
 * (contém majoritariamente números)
 */
export function looksLikePhone(str: string): boolean {
    const digits = str.replace(/\D/g, '')
    // Se tem 8+ dígitos e mais de 60% do conteúdo são dígitos
    return digits.length >= 8 && (digits.length / str.length) > 0.6
}

/**
 * Verifica se a string contém dígitos suficientes para busca parcial de telefone
 * (pelo menos 3 dígitos consecutivos)
 */
export function hasPhoneDigits(str: string): boolean {
    const digits = str.replace(/\D/g, '')
    return digits.length >= 3
}

/**
 * Prepara termos de busca inteligente
 * Retorna o termo original + versão normalizada se for telefone
 * Também retorna digitsOnly para busca parcial de telefone
 */
export function prepareSearchTerms(searchInput: string): {
    original: string;
    normalized: string | null;
    digitsOnly: string | null;
} {
    const trimmed = searchInput.trim()
    const digits = trimmed.replace(/\D/g, '')

    if (looksLikePhone(trimmed)) {
        return {
            original: trimmed,
            normalized: normalizePhone(trimmed),
            digitsOnly: digits
        }
    }

    // Se tem pelo menos 3 dígitos, permite busca parcial por telefone
    if (hasPhoneDigits(trimmed)) {
        return {
            original: trimmed,
            normalized: null,
            digitsOnly: digits
        }
    }

    return {
        original: trimmed,
        normalized: null,
        digitsOnly: null
    }
}

/**
 * Constrói filtro PostgREST para busca de contatos.
 * Trata corretamente:
 * - Telefones com símbolos (parênteses, +, traços)
 * - Código de país (55)
 * - Multi-word (nome + sobrenome)
 * - Caracteres que quebram o parser do PostgREST (parênteses)
 *
 * Uso: supabase.from('contatos').or(buildContactSearchFilter(term))
 */
export function buildContactSearchFilter(term: string): string {
    // Sanitiza parênteses que quebram o parser do PostgREST .or()
    const safeTerm = term.replace(/[()]/g, '').trim()
    const words = safeTerm.split(/\s+/)

    // Base: nome, sobrenome, email
    let filter = `nome.ilike.%${safeTerm}%,sobrenome.ilike.%${safeTerm}%,email.ilike.%${safeTerm}%`

    // Telefone: usa coluna normalizada quando possível
    const phoneDigits = term.replace(/\D/g, '')
    const normalizedPhone = normalizePhone(term)

    if (normalizedPhone.length >= 4) {
        // Busca pela coluna normalizada (sem formatação, sem código país)
        filter += `,telefone_normalizado.ilike.%${normalizedPhone}%`
        // Também busca pelos dígitos crus (com código país) para cobrir todos os casos
        if (phoneDigits !== normalizedPhone && phoneDigits.length >= 4) {
            filter += `,telefone_normalizado.ilike.%${phoneDigits}%`
        }
    }
    // Sempre busca no campo raw também (para match exato de formato)
    filter += `,telefone.ilike.%${safeTerm}%`

    // Multi-word: nome + sobrenome
    if (words.length >= 2) {
        filter += `,and(nome.ilike.%${words[0]}%,sobrenome.ilike.%${words.slice(1).join(' ')}%)`
    }

    return filter
}
