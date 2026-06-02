import * as XLSX from 'xlsx'

/** Lista genérica parseada: cabeçalho (colunas) + linhas como objetos por coluna. */
export interface ParsedLista {
  headers: string[]
  rows: Record<string, string>[]
}

/** Transforma um {{slug}} a partir de um nome de coluna ("Data do Evento" → "data_do_evento"). */
export function slugifyHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'coluna'
}

function fromMatrix(matrix: unknown[][]): ParsedLista {
  const clean = matrix.filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
  if (clean.length === 0) return { headers: [], rows: [] }
  const headers = clean[0].map((c, i) => String(c ?? '').trim() || `coluna_${i + 1}`)
  const rows = clean.slice(1).map((r) => {
    const o: Record<string, string> = {}
    headers.forEach((h, i) => {
      o[h] = String(r[i] ?? '').trim()
    })
    return o
  })
  return { headers, rows }
}

/** Cola de planilha (TSV/CSV/;). Primeira linha = cabeçalho. */
export function parsePastedLista(text: string): ParsedLista {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) return { headers: [], rows: [] }
  const first = lines[0]
  const delim = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ','
  const matrix = lines.map((l) => l.split(delim))
  return fromMatrix(matrix)
}

/** Arquivo .xlsx/.csv → primeira aba. */
export async function parseFileLista(file: File): Promise<ParsedLista> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { headers: [], rows: [] }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
  return fromMatrix(matrix)
}

/** Tenta adivinhar qual coluna é o telefone e qual é o nome pelo cabeçalho. */
export function guessColumns(headers: string[]): { telCol: string | null; nomeCol: string | null } {
  const norm = (h: string) => slugifyHeader(h)
  const telCol =
    headers.find((h) => /telefone|celular|whatsapp|phone|fone|numero|número/.test(norm(h))) ?? null
  const nomeCol =
    headers.find((h) => /^nome$|nome_completo|primeiro_nome|name|contato/.test(norm(h))) ?? null
  return { telCol, nomeCol }
}

/** Baixa um .xlsx modelo: colunas telefone/nome + uma coluna extra de exemplo
 *  (que vira variável {{cidade}}). O usuário pode renomear/adicionar colunas. */
export function baixarModeloPlanilha() {
  const linhas = [
    ['telefone', 'nome', 'cidade'],
    ['11999999999', 'Maria Silva', 'São Paulo'],
    ['21988887777', 'João Souza', 'Rio de Janeiro'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(linhas)
  ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contatos')
  XLSX.writeFile(wb, 'modelo-disparo.xlsx')
}
