/**
 * Máscara monetária BRL. Aceita string com qualquer formatação e devolve
 * o valor formatado como "R$ X.XXX,XX". Também converte de volta pra number.
 */
export function formatBRL(value: number | null | undefined): string {
    if (value == null || isNaN(Number(value))) return ''
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value))
}

/**
 * Converte string formatada (R$ 1.234,56) ou parcial em number.
 * Trabalha com os dígitos puros — interpreta os 2 últimos como centavos.
 */
export function parseBRLDigits(input: string): number {
    const digits = String(input).replace(/\D/g, '')
    if (!digits) return 0
    return parseInt(digits, 10) / 100
}

/**
 * Recebe input enquanto o user digita; mantém só dígitos, divide por 100
 * pra centavos e formata. Padrão usado em campos de moeda controlados.
 */
export function maskBRLInput(input: string): string {
    const value = parseBRLDigits(input)
    if (value === 0) return ''
    return formatBRL(value)
}
