import type { Database } from '../database.types'

type Contato = Database['public']['Tables']['contatos']['Row']

// Aceita qualquer objeto com nome/sobrenome (Contato, CardPerson, Person, etc.)
interface NameFields {
    nome?: string | null
    sobrenome?: string | null
}

export function formatContactName(contact: NameFields): string {
    return [contact.nome, contact.sobrenome].filter(Boolean).join(' ') || ''
}

export function getContactInitials(contact: NameFields): string {
    const n = contact.nome?.trim()
    const s = contact.sobrenome?.trim()
    if (n && s) return `${n.charAt(0)}${s.charAt(0)}`.toUpperCase()
    if (n) return n.charAt(0).toUpperCase()
    return 'S'
}

export function calculateAge(birthDate: string | null | undefined): number | null {
    if (!birthDate) return null

    const birth = new Date(birthDate)
    const today = new Date()

    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--
    }

    return age
}

export function getTipoPessoa(birthDate: string | null | undefined): 'adulto' | 'crianca' {
    const age = calculateAge(birthDate)
    if (age === null) return 'adulto' // Default to adult if no birth date
    return age < 18 ? 'crianca' : 'adulto'
}

// Preposições brasileiras que ficam minúsculas em nomes (exceto primeira palavra)
const LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'com', 'por', 'para'])

/** Title Case brasileiro: capitaliza palavras, preposições ficam minúsculas */
export function smartTitleCase(name: string | null | undefined): string {
    if (!name || !name.trim()) return name || ''
    const words = name.trim().replace(/\s+/g, ' ').split(' ')
    return words.map((word, i) => {
        const lower = word.toLowerCase()
        if (i === 0) return lower.charAt(0).toUpperCase() + lower.slice(1)
        if (LOWERCASE_WORDS.has(lower)) return lower
        return lower.charAt(0).toUpperCase() + lower.slice(1)
    }).join(' ')
}

/** Corrige nome/sobrenome: split se duplicados, title case */
export function sanitizeContactNames(
    nome: string,
    sobrenome: string | null
): { nome: string; sobrenome: string | null } {
    let n: string = (nome || '').trim().replace(/\s+/g, ' ')
    let s: string | null = (sobrenome || '').trim().replace(/\s+/g, ' ') || null

    // Case 1: nome == sobrenome (duplicado)
    if (n && s && n.toLowerCase() === s.toLowerCase()) {
        const parts = n.split(' ')
        if (parts.length > 1) {
            n = parts[0]
            s = parts.slice(1).join(' ')
        } else {
            s = null
        }
    }

    // Case 2: nome tem full name + sobrenome vazio
    if (!s && n.includes(' ')) {
        const parts = n.split(' ')
        n = parts[0]
        s = parts.slice(1).join(' ')
    }

    // Case 3: Aplica title case
    n = smartTitleCase(n)
    s = s ? smartTitleCase(s) : null

    return { nome: n, sobrenome: s || null }
}

/** Valida CPF brasileiro pelo algoritmo de checksum (2 dígitos verificadores) */
export function validateCPF(cpf: string | null | undefined): boolean {
    if (!cpf) return false
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) return false

    // Rejeita sequências iguais (000.000.000-00, etc.)
    if (/^(\d)\1{10}$/.test(digits)) return false

    const d = digits.split('').map(Number)

    // Primeiro dígito verificador
    let sum = 0
    for (let i = 0; i < 9; i++) sum += d[i] * (10 - i)
    let check = 11 - (sum % 11)
    if (check >= 10) check = 0
    if (d[9] !== check) return false

    // Segundo dígito verificador
    sum = 0
    for (let i = 0; i < 10; i++) sum += d[i] * (11 - i)
    check = 11 - (sum % 11)
    if (check >= 10) check = 0
    if (d[10] !== check) return false

    return true
}

export function getContactSummary(contacts: Contato[]): { adults: number, children: number } {
    return contacts.reduce(
        (acc, contact) => {
            if (contact.tipo_pessoa === 'crianca') {
                acc.children++
            } else {
                acc.adults++
            }
            return acc
        },
        { adults: 0, children: 0 }
    )
}
