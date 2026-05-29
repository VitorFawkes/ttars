import { normalizePhone } from '../../utils/normalizePhone'
import { ETAPA_ORDER } from '../../hooks/convidados/types'
import type { WeddingWithGuests } from '../../hooks/convidados/types'

/** Normaliza o título do casal para agrupamento: minúsculo, sem acento,
 *  espaços colapsados. "Raíssa e Gustavo " → "raissa e gustavo". */
export function normalizeWeddingTitle(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface DuplicateWeddingGroup {
  /** Chave do grupo (título normalizado + data). */
  key: string
  /** Nome de exibição do casal (do casamento sugerido como principal). */
  displayTitle: string
  /** Data do casamento (ISO) compartilhada pelo grupo, ou null. */
  weddingDate: string | null
  /** Casamentos do grupo, ordenados com o sugerido principal primeiro. */
  weddings: WeddingWithGuests[]
  /** Id sugerido como principal (mais convidados; empate → etapa mais avançada). */
  suggestedDestinoId: string
}

/**
 * Detecta casamentos cadastrados em duplicidade no board de convidados.
 * Agrupa por título normalizado do casal + mesma data; retorna apenas grupos
 * com 2+ casamentos. O destino sugerido é o de mais convidados (empate resolve
 * pela etapa mais avançada do funil de comunicação).
 */
export function findDuplicateWeddings(
  weddings: WeddingWithGuests[],
): DuplicateWeddingGroup[] {
  const groups = new Map<string, WeddingWithGuests[]>()

  for (const w of weddings) {
    const titleKey = normalizeWeddingTitle(w.titulo)
    if (!titleKey) continue
    // Mesma data (ou ambos sem data) faz parte da chave — evita juntar casais
    // homônimos de datas diferentes.
    const dateKey = w.wedding_date ?? 'sem-data'
    const key = `${titleKey}__${dateKey}`
    const list = groups.get(key) ?? []
    list.push(w)
    groups.set(key, list)
  }

  const result: DuplicateWeddingGroup[] = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue

    const ranked = [...list].sort((a, b) => {
      // 1º critério: mais convidados.
      if (b.counts.total !== a.counts.total) return b.counts.total - a.counts.total
      // 2º critério: etapa mais avançada (índice maior em ETAPA_ORDER).
      return ETAPA_ORDER.indexOf(b.etapa) - ETAPA_ORDER.indexOf(a.etapa)
    })

    result.push({
      key,
      displayTitle: ranked[0].titulo,
      weddingDate: ranked[0].wedding_date,
      weddings: ranked,
      suggestedDestinoId: ranked[0].id,
    })
  }

  // Grupos mais "pesados" (mais casamentos, depois mais convidados) primeiro.
  result.sort((a, b) => {
    if (b.weddings.length !== a.weddings.length) return b.weddings.length - a.weddings.length
    const aTotal = a.weddings.reduce((s, w) => s + w.counts.total, 0)
    const bTotal = b.weddings.reduce((s, w) => s + w.counts.total, 0)
    return bTotal - aTotal
  })

  return result
}

/**
 * Estima quantos convidados ficariam repetidos (mesmo telefone) entre os
 * casamentos de um grupo — só pra mostrar uma prévia na UI. A dedup real
 * acontece no banco (RPC fundir_casamentos).
 */
export function estimateDuplicateGuests(group: DuplicateWeddingGroup): number {
  const seen = new Set<string>()
  let dups = 0
  for (const w of group.weddings) {
    for (const g of w.guests) {
      const norm = normalizePhone(g.telefone)
      if (!norm) continue
      if (seen.has(norm)) dups += 1
      else seen.add(norm)
    }
  }
  return dups
}
