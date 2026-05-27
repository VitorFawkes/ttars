import type { Convite, FaixaKey, LadoKey, TipoKey } from './types'
import { FAIXAS, LADOS, TIPOS } from './types'

function cellEscape(v: unknown): string {
  const s = String(v ?? '')
  if (/[,;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function exportConvitesCSV(convites: Convite[]): string {
  const header = ['Nome do convite', 'Pessoa', 'Idade', 'Telefone', 'Lado', 'Tipo de relação', 'Observação']
  const rows: string[][] = [header]
  for (const c of convites) {
    if (c.pessoas.length === 0) {
      rows.push([c.nome, '', '', '', '', '', ''])
    } else {
      for (const p of c.pessoas) {
        rows.push([
          c.nome,
          p.nome_raw,
          FAIXAS.find((f) => f.key === p.faixa)?.label || '',
          p.telefone_raw,
          LADOS.find((l) => l.key === p.lado)?.label || '',
          TIPOS.find((t) => t.key === p.tipo)?.label || '',
          p.observacoes,
        ])
      }
    }
  }
  return '﻿' + rows.map((r) => r.map(cellEscape).join(',')).join('\n')
}

function detectSeparator(text: string): ',' | ';' {
  const sample = text.split('\n').slice(0, 5).join('\n')
  const commas = (sample.match(/,/g) || []).length
  const semis = (sample.match(/;/g) || []).length
  return semis > commas ? ';' : ','
}

export function parseCSV(text: string, separator?: ',' | ';'): string[][] {
  const sep = separator || detectSeparator(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'; i++
      } else if (c === '"') inQ = false
      else cell += c
    } else {
      if (c === '"') inQ = true
      else if (c === sep) { row.push(cell); cell = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++
        row.push(cell); rows.push(row); row = []; cell = ''
      } else cell += c
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.length))
}

export interface ImportedConvite {
  tempId: string
  nome: string
  pessoas: ImportedPessoa[]
}

export interface ImportedPessoa {
  tempId: string
  nome_raw: string
  telefone_raw: string
  email_raw: string
  faixa: FaixaKey
  lado: LadoKey | ''
  tipo: TipoKey | ''
  observacoes: string
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

function findIdx(header: string[], matches: string[]): number {
  return header.findIndex((h) => matches.some((m) => h.toLowerCase().includes(m)))
}

const LEGACY_VINCULO_MAP: Record<string, { lado: LadoKey; tipo: TipoKey }> = {
  amigos: { lado: 'ambos', tipo: 'amigo' },
  'amigos do noivo': { lado: 'noivo', tipo: 'amigo' },
  'amigos da noiva': { lado: 'noiva', tipo: 'amigo' },
  'família do noivo': { lado: 'noivo', tipo: 'familia' },
  'família da noiva': { lado: 'noiva', tipo: 'familia' },
  padrinhos: { lado: 'ambos', tipo: 'padrinho' },
}

export function importConvitesCSV(text: string): ImportedConvite[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.toLowerCase().trim())
  const idx = {
    nomeConvite: findIdx(header, ['nome do convite', 'convite']),
    nomePessoa: findIdx(header, ['pessoa', 'nome do convidado', 'convidado']),
    faixa: findIdx(header, ['idade', 'faixa']),
    telefone: findIdx(header, ['telefone', 'ddd']),
    email: findIdx(header, ['email', 'e-mail']),
    lado: findIdx(header, ['lado']),
    tipo: findIdx(header, ['tipo']),
    vinculo: findIdx(header, ['rela', 'grupo', 'víncul', 'vincul']),
    obs: findIdx(header, ['observa']),
  }

  const conviteByName = new Map<string, ImportedConvite>()
  const result: ImportedConvite[] = []
  let lastConvite: ImportedConvite | null = null

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const nomeConvite = (idx.nomeConvite >= 0 ? row[idx.nomeConvite] : '')?.trim() || ''
    const nomePessoa = (idx.nomePessoa >= 0 ? row[idx.nomePessoa] : '')?.trim() || ''

    let convite: ImportedConvite
    if (nomeConvite) {
      const existing = conviteByName.get(nomeConvite.toLowerCase())
      if (existing) convite = existing
      else {
        convite = { tempId: uid(), nome: nomeConvite, pessoas: [] }
        conviteByName.set(nomeConvite.toLowerCase(), convite)
        result.push(convite)
      }
      lastConvite = convite
    } else if (lastConvite) {
      convite = lastConvite
    } else {
      convite = { tempId: uid(), nome: nomePessoa || 'Sem nome', pessoas: [] }
      result.push(convite)
      lastConvite = convite
    }

    if (!nomePessoa) continue

    const faixaRaw = (idx.faixa >= 0 ? row[idx.faixa] : 'Adulto')?.trim() || 'Adulto'
    const faixa: FaixaKey =
      FAIXAS.find((f) => f.label.toLowerCase() === faixaRaw.toLowerCase())?.key ||
      FAIXAS.find((f) => f.key === faixaRaw.toLowerCase())?.key ||
      'adulto'

    let lado: LadoKey | '' = ''
    let tipo: TipoKey | '' = ''
    if (idx.lado >= 0) {
      const ladoRaw = row[idx.lado]?.trim().toLowerCase() || ''
      lado = LADOS.find((l) => l.key === ladoRaw || l.label.toLowerCase() === ladoRaw)?.key || ''
    }
    if (idx.tipo >= 0) {
      const tipoRaw = row[idx.tipo]?.trim() || ''
      tipo = TIPOS.find((t) => t.label.toLowerCase() === tipoRaw.toLowerCase() || t.key === tipoRaw.toLowerCase())?.key || ''
    }
    if ((!lado || !tipo) && idx.vinculo >= 0) {
      const v = row[idx.vinculo]?.trim().toLowerCase() || ''
      const matched = LEGACY_VINCULO_MAP[v]
      if (matched) {
        if (!lado) lado = matched.lado
        if (!tipo) tipo = matched.tipo
      }
    }

    convite.pessoas.push({
      tempId: uid(),
      nome_raw: nomePessoa,
      telefone_raw: (idx.telefone >= 0 ? row[idx.telefone] : '')?.trim() || '',
      email_raw: (idx.email >= 0 ? row[idx.email] : '')?.trim() || '',
      faixa,
      lado,
      tipo,
      observacoes: (idx.obs >= 0 ? row[idx.obs] : '')?.trim() || '',
    })
  }
  return result
}

export function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
