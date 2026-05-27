import type { Convite, FaixaKey, LadoKey, TipoKey } from './types'

export interface ConvitesStats {
  totalConvites: number
  totalPessoas: number
  adultos: number
  criancas: number
  idosos: number
  bebes: number
  semTelefone: number
  porTipo: Record<TipoKey | '', number>
  porLado: Record<LadoKey | '', number>
}

const ADULT_FAIXAS: FaixaKey[] = ['adulto', 'idoso']

export function calcStatsConvites(convites: Convite[]): ConvitesStats {
  const stats: ConvitesStats = {
    totalConvites: convites.length,
    totalPessoas: 0,
    adultos: 0,
    criancas: 0,
    idosos: 0,
    bebes: 0,
    semTelefone: 0,
    porTipo: { amigo: 0, familia: 0, padrinho: 0, '': 0 },
    porLado: { ambos: 0, noiva: 0, noivo: 0, '': 0 },
  }
  for (const c of convites) {
    for (const p of c.pessoas) {
      stats.totalPessoas++
      if (p.faixa === 'adulto') stats.adultos++
      else if (p.faixa === 'idoso') stats.idosos++
      else if (p.faixa === 'crianca') stats.criancas++
      else if (p.faixa === 'bebe') stats.bebes++
      if (ADULT_FAIXAS.includes(p.faixa) && !(p.telefone_raw || '').trim()) {
        stats.semTelefone++
      }
      stats.porTipo[p.tipo || ''] = (stats.porTipo[p.tipo || ''] || 0) + 1
      stats.porLado[p.lado || ''] = (stats.porLado[p.lado || ''] || 0) + 1
    }
  }
  return stats
}

export function isAdultoOuIdoso(faixa: FaixaKey): boolean {
  return ADULT_FAIXAS.includes(faixa)
}
