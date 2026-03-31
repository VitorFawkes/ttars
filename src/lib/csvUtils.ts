/**
 * Utilitários compartilhados para parsing de CSV/Excel.
 * Usados por VendasMondePage e ImportacaoPosVendaPage.
 */

// ─── String helpers ──────────────────────────────────────────

/** Normaliza removendo acentos, º, pontuação e espaços extras */
export const norm = (s: string) => s.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°.]/g, '')
    .replace(/\s+/g, ' ')

// ─── Date parsing ────────────────────────────────────────────

/** Converte data BR (dd/mm/yyyy), ISO, ou serial Excel para YYYY-MM-DD. Retorna null se inválido. */
export function parseDateBR(value: unknown): string | null {
    if (value == null) return null
    // Excel serial date (number)
    if (typeof value === 'number') {
        const epoch = new Date(Date.UTC(1899, 11, 30))
        const d = new Date(epoch.getTime() + value * 86400000)
        if (isNaN(d.getTime())) return null
        return d.toISOString().slice(0, 10)
    }
    const s = String(value).trim()
    if (!s) return null
    // dd/mm/yyyy or dd-mm-yyyy
    const brMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
    if (brMatch) {
        const [, dd, mm, yyyy] = brMatch
        const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00`)
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }
    // yyyy-mm-dd (ISO)
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
        const d = new Date(isoMatch[0] + 'T00:00:00')
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }
    return null
}

// ─── CSV parsing ─────────────────────────────────────────────

/** Parse CSV text natively — preserva UTF-8 sem corrupção do XLSX.js */
export function parseCSVNative(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return []

    // Detectar separador pela primeira linha (header) — fora de quotes
    const detectSep = (line: string): string => {
        let inQ = false, semis = 0, commas = 0
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; continue }
            if (inQ) continue
            if (ch === ';') semis++
            if (ch === ',') commas++
        }
        return semis > commas ? ';' : ','
    }
    const sep = detectSep(lines[0])

    const parseLine = (line: string): string[] => {
        const result: string[] = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
                else if (ch === '"') { inQuotes = false }
                else { current += ch }
            } else {
                if (ch === '"') { inQuotes = true }
                else if (ch === sep) { result.push(current.trim()); current = '' }
                else { current += ch }
            }
        }
        result.push(current.trim())
        return result
    }

    const headers = parseLine(lines[0])
    return lines.slice(1).map(line => {
        const values = parseLine(line)
        const row: Record<string, string> = {}
        headers.forEach((h, i) => { row[h] = values[i] || '' })
        return row
    })
}

// ─── Column matching ─────────────────────────────────────────

/** Encontra coluna por aliases (exact → partial match) */
export function findColumn(headers: string[], aliases: string[]): string | null {
    const normalized = headers.map(h => norm(h))
    // Exact match
    for (const alias of aliases) {
        const idx = normalized.findIndex(h => h === alias)
        if (idx >= 0) return headers[idx]
    }
    // Partial match
    for (const alias of aliases) {
        const idx = normalized.findIndex(h => h.includes(alias))
        if (idx >= 0) return headers[idx]
    }
    return null
}

// ─── Array helpers ───────────────────────────────────────────

/** Divide array em chunks de tamanho fixo */
export function chunked<T>(arr: T[], size: number): T[][] {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
    return result
}

// ─── Formatting ──────────────────────────────────────────────

export const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const formatDateBR = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(iso + 'T00:00:00')
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Column alias constants (shared) ─────────────────────────

export const VENDA_COLUMN_ALIASES = ['venda n', 'venda no', 'n venda', 'venda_num', 'venda numero', 'num venda', 'no venda']
export const PRODUTO_ALIASES = ['produto', 'product', 'nome produto']
export const VALOR_TOTAL_ALIASES = ['valor total', 'total', 'valortotal', 'vl total']
export const RECEITA_ALIASES = ['receitas', 'receita', 'revenue']
export const PASSAGEIRO_ALIASES = ['passageiros', 'passageiro', 'passengers', 'pax', 'nomes passageiros']
export const FORNECEDOR_ALIASES = ['fornecedor', 'supplier', 'hotel', 'cia aerea', 'companhia']
export const REPRESENTANTE_ALIASES = ['representante', 'representative', 'agencia', 'operadora']
export const DOCUMENTO_ALIASES = ['documento', 'doc', 'confirmacao', 'localizador', 'numero confirmacao', 'n confirmacao']
export const DATA_INICIO_ALIASES = ['data inicio', 'data de inicio', 'check in', 'checkin', 'inicio', 'dt inicio']
export const DATA_FIM_ALIASES = ['data fim', 'data de fim', 'check out', 'checkout', 'fim', 'dt fim']
