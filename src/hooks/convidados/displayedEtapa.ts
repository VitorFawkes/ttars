import { computeFluxoMessages, type FluxoVariation } from './useFluxoConfig'
import type { WeddingFluxoAssignment } from './useWeddingFluxo'
import type { EtapaConvidados } from './types'

/** Promom1..promom5 (índices 1-5) → "Promo".
 *  pade1m1..pade2m25 (índices 6-35) → "Padrão". */
function categoriaPorIndice(index: number): EtapaConvidados {
  if (index >= 1 && index <= 5) return 'promo'
  return 'padrao'
}

/** Calcula a etapa exibida do casamento.
 *
 *  - Se a etapa "crua" (do banco) for `encerrado` ou `cancelado`, ela vence
 *    (foram ações manuais do usuário no card/detalhe).
 *  - Caso contrário, a etapa é derivada da posição atual no fluxo:
 *      • mensagens 1..5  (promom*)  → `promo`
 *      • mensagens 6..35 (pade*m*)  → `padrao`
 *  - Sem fluxo configurado para o casamento, default `padrao`.
 */
export function computeDisplayedEtapa(
  rawEtapa: EtapaConvidados,
  assignment: WeddingFluxoAssignment | null | undefined,
  fluxo: FluxoVariation | null | undefined,
  today: Date,
): EtapaConvidados {
  if (rawEtapa === 'encerrado' || rawEtapa === 'cancelado') return rawEtapa
  if (!assignment || !fluxo) return 'padrao'

  const startDate = new Date(assignment.startDate + 'T00:00:00')
  if (Number.isNaN(startDate.getTime())) return 'padrao'

  const full = computeFluxoMessages(fluxo.intervals, new Date(2000, 0, 1))
  const startEntry = full.find(m => m.index === assignment.startIndex)
  if (!startEntry) return 'padrao'

  const offsetMs = startDate.getTime() - startEntry.date.getTime()
  const todayMs = today.getTime()

  // currentIndex = última mensagem cuja data efetiva já passou (ou hoje).
  // Se ainda nem começou (today < startDate), assume startIndex.
  let currentIndex = assignment.startIndex
  for (const msg of full) {
    if (msg.index < assignment.startIndex) continue
    const actualMs = msg.date.getTime() + offsetMs
    if (actualMs <= todayMs) currentIndex = msg.index
    else break
  }

  return categoriaPorIndice(currentIndex)
}
