import * as XLSX from 'xlsx'
import { normalizePhone } from '../../../utils/normalizePhone'

export interface GuestRow {
  rowIndex: number
  nome: string
  sobrenome: string | null
  telefone: string | null
  telefoneNorm: string | null
  email: string | null
  errors: string[]
}

export interface WeddingGroup {
  codigo: string
  titulo: string
  local: string | null
  data_evento_iso: string | null
  site_casamento: string | null
  data_final_acao_iso: string | null
  link_atendimento: string | null
  guests: GuestRow[]
}

export interface ParseResult {
  groups: WeddingGroup[]
  totalRows: number
  rowsSemCodigo: number
  rowsSemNome: number
}

function cellToString(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length === 0 ? null : s
}

function cellToNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function excelSerialToISO(serial: number | null): string | null {
  if (serial == null) return null
  // Excel serial dates: dias desde 1900-01-01 (com o bug do 1900 = ano bissexto).
  // (serial - 25569) * 86400 * 1000 = ms desde Unix epoch.
  if (serial < 1 || serial > 200000) return null
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function tryParseTextDate(v: unknown): string | null {
  const s = cellToString(v)
  if (!s) return null
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const day = m[1].padStart(2, '0')
    const month = m[2].padStart(2, '0')
    return `${m[3]}-${month}-${day}`
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

/** Lê a primeira aba de um arquivo .xlsx e agrupa as linhas por Código do
 *  Casamento (coluna E). Cabeçalho na linha 1 é ignorado. */
export async function parseXlsxFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) {
    return { groups: [], totalRows: 0, rowsSemCodigo: 0, rowsSemNome: 0 }
  }

  // header:1 → cada linha é um array indexado por coluna (A=0, B=1, …)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  // Pula primeira linha (cabeçalho)
  const dataRows = rows.slice(1)

  const groups = new Map<string, WeddingGroup>()
  let totalRows = 0
  let rowsSemCodigo = 0
  let rowsSemNome = 0

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i] ?? []
    const rowIndex = i + 2 // linha real na planilha (1-based, +1 pelo header)

    const nome = cellToString(r[0])
    const sobrenome = cellToString(r[1])
    const telefoneRaw = cellToString(r[2])
    const email = cellToString(r[3])
    const codigo = cellToString(r[4])

    // Linha totalmente vazia: ignora
    if (!nome && !sobrenome && !telefoneRaw && !email && !codigo) continue

    totalRows++

    if (!codigo) {
      rowsSemCodigo++
      continue
    }
    if (!nome) {
      rowsSemNome++
      continue
    }

    let group = groups.get(codigo)
    if (!group) {
      const titulo = cellToString(r[5]) ?? codigo
      const local = cellToString(r[6])
      const dataSerial = cellToNumber(r[8])
      const dataIso = excelSerialToISO(dataSerial) ?? tryParseTextDate(r[7])
      const site = cellToString(r[9])
      const finalSerial = cellToNumber(r[10])
      const finalIso = excelSerialToISO(finalSerial) ?? tryParseTextDate(r[11])
      const link = cellToString(r[12])

      group = {
        codigo,
        titulo,
        local,
        data_evento_iso: dataIso,
        site_casamento: site,
        data_final_acao_iso: finalIso,
        link_atendimento: link,
        guests: [],
      }
      groups.set(codigo, group)
    }

    const errors: string[] = []
    const telefoneNorm = normalizePhone(telefoneRaw)
    if (telefoneRaw && !telefoneNorm) {
      errors.push('telefone inválido')
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push('email inválido')
    }

    group.guests.push({
      rowIndex,
      nome,
      sobrenome,
      telefone: telefoneRaw,
      telefoneNorm,
      email,
      errors,
    })
  }

  return {
    groups: Array.from(groups.values()),
    totalRows,
    rowsSemCodigo,
    rowsSemNome,
  }
}
