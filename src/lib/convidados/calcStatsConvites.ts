import type { Convite, FaixaKey, LadoKey, TipoKey } from './types'
import { normalizeFaixa } from './types'

export interface ConvitesStats {
  totalConvites: number
  totalPessoas: number
  adultos: number
  menores: number
  semTelefone: number
  porTipo: Record<TipoKey | '', number>
  porLado: Record<LadoKey | '', number>
}

export function calcStatsConvites(convites: Convite[]): ConvitesStats {
  const stats: ConvitesStats = {
    totalConvites: convites.length,
    totalPessoas: 0,
    adultos: 0,
    menores: 0,
    semTelefone: 0,
    porTipo: { amigo: 0, familia: 0, padrinho: 0, '': 0 },
    porLado: { ambos: 0, noiva: 0, noivo: 0, '': 0 },
  }
  for (const c of convites) {
    for (const p of c.pessoas) {
      stats.totalPessoas++
      const faixa = normalizeFaixa(p.faixa)
      if (faixa === 'adulto') stats.adultos++
      else stats.menores++
      if (faixa === 'adulto' && !(p.telefone_raw || '').trim()) {
        stats.semTelefone++
      }
      stats.porTipo[p.tipo || ''] = (stats.porTipo[p.tipo || ''] || 0) + 1
      stats.porLado[p.lado || ''] = (stats.porLado[p.lado || ''] || 0) + 1
    }
  }
  return stats
}

export function precisaTelefone(faixa: FaixaKey): boolean {
  return normalizeFaixa(faixa) === 'adulto'
}
