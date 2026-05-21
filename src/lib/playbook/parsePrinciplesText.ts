/**
 * Parser do formato legacy `principles_text` (string única numerada) pro
 * formato estruturado `IdentityPrinciple[]`.
 *
 * Heurística: divide por linha que começa com "N." (número + ponto + espaço).
 * Cada bloco vira 1 princípio:
 *   - 1ª "frase" antes do primeiro "." ou linha vira `title`
 *   - resto vira `body`
 *
 * Casos suportados (formato real da Patricia):
 *
 *   COMO EU PENSO (princípios que organizam tudo o que eu faço)
 *
 *   1. Eu não invento o que não sei. Nome, prazo, valor — se não está...
 *
 *   2. Eu sou minhas restrições, não as escondo. A janela exata...
 *
 * O cabeçalho "COMO EU PENSO" e linhas em branco entre itens são
 * ignorados. Se o texto não tem nada numerado, retorna [] (admin começa
 * do zero na UI nova).
 */

import type { IdentityPrinciple } from '@/hooks/v2/playbook/useAgentIdentity'

const NUMBERED_LINE = /^\s*(\d+)\.\s+(.+)$/

export function parsePrinciplesText(text: string | null | undefined): IdentityPrinciple[] {
  if (!text || !text.trim()) return []

  const lines = text.split('\n')
  const items: Array<{ num: number; raw: string[] }> = []
  let current: { num: number; raw: string[] } | null = null

  for (const line of lines) {
    const match = line.match(NUMBERED_LINE)
    if (match) {
      // Fecha o anterior antes de abrir o novo
      if (current) items.push(current)
      current = { num: parseInt(match[1], 10), raw: [match[2]] }
    } else if (current) {
      // Linha de continuação do item atual
      if (line.trim()) current.raw.push(line.trim())
      // Linhas em branco: agrupa próximas linhas no mesmo item
    }
    // Linha antes do primeiro item numerado é descartada (header tipo "COMO EU PENSO")
  }
  if (current) items.push(current)

  if (items.length === 0) return []

  return items.map((item, idx) => {
    const fullText = item.raw.join(' ').trim()
    const { title, body } = splitTitleBody(fullText)
    return {
      key: `principle_${item.num}`,
      title,
      body,
      enabled: true,
      order: item.num > 0 ? item.num : idx + 1,
    }
  })
}

/**
 * Tenta extrair um título curto + corpo do texto cru de 1 princípio.
 *
 * Heurística:
 *   1. Se 1ª frase (até "." ou ":") tem ≤ 80 chars E há mais texto depois,
 *      usa como title; resto = body.
 *   2. Se não, texto inteiro vira title E body fica vazio (admin edita).
 *
 * Caso especial: princípios da Patricia geralmente têm formato
 * "Eu X. Y Z W..." — primeira frase é o "lema", resto é explicação.
 */
function splitTitleBody(text: string): { title: string; body: string } {
  const sentenceEnd = text.search(/[.:](\s|$)/)
  if (sentenceEnd > 0 && sentenceEnd < 80) {
    const title = text.slice(0, sentenceEnd).trim()
    const body = text.slice(sentenceEnd + 1).trim()
    if (body.length > 0) {
      return { title, body }
    }
  }
  // Sem corte natural — texto inteiro vira título curto se cabe,
  // senão pega 60 chars como título e o resto como body
  if (text.length <= 80) {
    return { title: text, body: '' }
  }
  return {
    title: text.slice(0, 60).trim() + '...',
    body: text,
  }
}
