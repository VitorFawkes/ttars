// Códigos de país (DDI) para o telefone dos convidados que o casal preenche.
//
// Regra de armazenamento em `telefone_raw` (compatível de ponta a ponta):
//  - Brasil (DDI 55): guarda EXATAMENTE como antes — sem "+", no formato
//    BR "DD 99999-9999". Zero mudança para os casamentos já existentes e para
//    o fluxo de envio BR (normalize_phone_brazil / normalizePhone).
//  - Internacional: guarda "+DDI dígitos" (ex: "+1 4155550123"). O util
//    `normalizePhone` e a função SQL `normalize_phone_brazil` preservam o DDI
//    estrangeiro (só removem o 55 de números BR-shaped).
//
// A lista cobre a maior parte dos países; o item "Outro" é uma saída livre
// para quem tiver convidado de um país fora da lista (digita o "+DDI" na mão).

import { formatPhoneBR } from './formatPhoneBR'

export interface Country {
  flag: string
  name: string
  iso: string
  dial: string
}

// Sentinela para a opção "Outro país" (entrada livre com "+").
export const OTHER_DIAL = 'other'

// Brasil, Portugal e EUA/Canadá primeiro (mais comuns), depois em ordem
// alfabética por nome. Cada DDI aparece uma única vez (ex: +1 = EUA/Canadá).
// `iso` é a sigla curta mostrada no gatilho compacto do seletor.
export const COUNTRIES: Country[] = [
  { flag: '🇧🇷', name: 'Brasil', iso: 'BR', dial: '55' },
  { flag: '🇵🇹', name: 'Portugal', iso: 'PT', dial: '351' },
  { flag: '🇺🇸', name: 'EUA / Canadá', iso: 'US', dial: '1' },
  { flag: '🇿🇦', name: 'África do Sul', iso: 'ZA', dial: '27' },
  { flag: '🇩🇪', name: 'Alemanha', iso: 'DE', dial: '49' },
  { flag: '🇦🇩', name: 'Andorra', iso: 'AD', dial: '376' },
  { flag: '🇦🇴', name: 'Angola', iso: 'AO', dial: '244' },
  { flag: '🇸🇦', name: 'Arábia Saudita', iso: 'SA', dial: '966' },
  { flag: '🇦🇷', name: 'Argentina', iso: 'AR', dial: '54' },
  { flag: '🇦🇺', name: 'Austrália', iso: 'AU', dial: '61' },
  { flag: '🇦🇹', name: 'Áustria', iso: 'AT', dial: '43' },
  { flag: '🇧🇪', name: 'Bélgica', iso: 'BE', dial: '32' },
  { flag: '🇧🇴', name: 'Bolívia', iso: 'BO', dial: '591' },
  { flag: '🇧🇬', name: 'Bulgária', iso: 'BG', dial: '359' },
  { flag: '🇨🇱', name: 'Chile', iso: 'CL', dial: '56' },
  { flag: '🇨🇳', name: 'China', iso: 'CN', dial: '86' },
  { flag: '🇨🇴', name: 'Colômbia', iso: 'CO', dial: '57' },
  { flag: '🇰🇷', name: 'Coreia do Sul', iso: 'KR', dial: '82' },
  { flag: '🇨🇷', name: 'Costa Rica', iso: 'CR', dial: '506' },
  { flag: '🇭🇷', name: 'Croácia', iso: 'HR', dial: '385' },
  { flag: '🇨🇺', name: 'Cuba', iso: 'CU', dial: '53' },
  { flag: '🇩🇰', name: 'Dinamarca', iso: 'DK', dial: '45' },
  { flag: '🇪🇬', name: 'Egito', iso: 'EG', dial: '20' },
  { flag: '🇦🇪', name: 'Emirados Árabes', iso: 'AE', dial: '971' },
  { flag: '🇪🇨', name: 'Equador', iso: 'EC', dial: '593' },
  { flag: '🇸🇰', name: 'Eslováquia', iso: 'SK', dial: '421' },
  { flag: '🇸🇮', name: 'Eslovênia', iso: 'SI', dial: '386' },
  { flag: '🇪🇸', name: 'Espanha', iso: 'ES', dial: '34' },
  { flag: '🇫🇮', name: 'Finlândia', iso: 'FI', dial: '358' },
  { flag: '🇫🇷', name: 'França', iso: 'FR', dial: '33' },
  { flag: '🇬🇷', name: 'Grécia', iso: 'GR', dial: '30' },
  { flag: '🇬🇹', name: 'Guatemala', iso: 'GT', dial: '502' },
  { flag: '🇳🇱', name: 'Holanda', iso: 'NL', dial: '31' },
  { flag: '🇭🇺', name: 'Hungria', iso: 'HU', dial: '36' },
  { flag: '🇮🇳', name: 'Índia', iso: 'IN', dial: '91' },
  { flag: '🇮🇩', name: 'Indonésia', iso: 'ID', dial: '62' },
  { flag: '🇮🇪', name: 'Irlanda', iso: 'IE', dial: '353' },
  { flag: '🇮🇸', name: 'Islândia', iso: 'IS', dial: '354' },
  { flag: '🇮🇱', name: 'Israel', iso: 'IL', dial: '972' },
  { flag: '🇮🇹', name: 'Itália', iso: 'IT', dial: '39' },
  { flag: '🇯🇵', name: 'Japão', iso: 'JP', dial: '81' },
  { flag: '🇱🇧', name: 'Líbano', iso: 'LB', dial: '961' },
  { flag: '🇱🇺', name: 'Luxemburgo', iso: 'LU', dial: '352' },
  { flag: '🇲🇾', name: 'Malásia', iso: 'MY', dial: '60' },
  { flag: '🇲🇹', name: 'Malta', iso: 'MT', dial: '356' },
  { flag: '🇲🇦', name: 'Marrocos', iso: 'MA', dial: '212' },
  { flag: '🇲🇽', name: 'México', iso: 'MX', dial: '52' },
  { flag: '🇳🇴', name: 'Noruega', iso: 'NO', dial: '47' },
  { flag: '🇳🇿', name: 'Nova Zelândia', iso: 'NZ', dial: '64' },
  { flag: '🇵🇾', name: 'Paraguai', iso: 'PY', dial: '595' },
  { flag: '🇵🇪', name: 'Peru', iso: 'PE', dial: '51' },
  { flag: '🇵🇱', name: 'Polônia', iso: 'PL', dial: '48' },
  // Porto Rico e Rep. Dominicana são +1 (NANP): 1787/1809 são códigos de área,
  // não DDI. Incluí-los sequestrava números dos EUA/Canadá começando por
  // 787/809. Ficam cobertos pela entrada "EUA / Canadá" (+1).
  { flag: '🇬🇧', name: 'Reino Unido', iso: 'GB', dial: '44' },
  { flag: '🇨🇿', name: 'República Tcheca', iso: 'CZ', dial: '420' },
  { flag: '🇷🇴', name: 'Romênia', iso: 'RO', dial: '40' },
  { flag: '🇷🇺', name: 'Rússia', iso: 'RU', dial: '7' },
  { flag: '🇸🇬', name: 'Singapura', iso: 'SG', dial: '65' },
  { flag: '🇸🇪', name: 'Suécia', iso: 'SE', dial: '46' },
  { flag: '🇨🇭', name: 'Suíça', iso: 'CH', dial: '41' },
  { flag: '🇹🇭', name: 'Tailândia', iso: 'TH', dial: '66' },
  { flag: '🇹🇷', name: 'Turquia', iso: 'TR', dial: '90' },
  { flag: '🇺🇾', name: 'Uruguai', iso: 'UY', dial: '598' },
  { flag: '🇻🇪', name: 'Venezuela', iso: 'VE', dial: '58' },
]

// DDIs conhecidos ordenados do mais longo para o mais curto, para casar o
// prefixo mais específico primeiro (ex: "595" antes de "55", "1809" antes de "1").
const KNOWN_DIALS = COUNTRIES.map((c) => c.dial).sort((a, b) => b.length - a.length)

export function countryByDial(dial: string): Country | undefined {
  return COUNTRIES.find((c) => c.dial === dial)
}

/**
 * Interpreta um `telefone_raw` guardado em { dial, local }.
 *  - Vazio → Brasil, campo vazio.
 *  - Começa com "+" → casa o DDI conhecido mais longo; se nenhum casar, cai em
 *    "Outro" preservando o valor cru.
 *  - Sem "+" (dado BR legado) → Brasil, já no formato BR.
 */
export function parsePhoneValue(raw: string | null | undefined): { dial: string; local: string } {
  const s = String(raw ?? '').trim()
  if (!s) return { dial: '55', local: '' }

  if (s.startsWith('+')) {
    const digits = s.replace(/\D/g, '')
    const match = KNOWN_DIALS.find((d) => digits.startsWith(d))
    if (match) {
      const rest = digits.slice(match.length)
      // Brasil digitado com "+55": volta ao formato BR clássico.
      if (match === '55') return { dial: '55', local: formatPhoneBR(rest) }
      return { dial: match, local: rest }
    }
    // DDI fora da lista: entrada livre, mantém o número inteiro.
    return { dial: OTHER_DIAL, local: s }
  }

  // Legado BR: já vem como "DD 99999-9999".
  return { dial: '55', local: s }
}

/**
 * Monta o `telefone_raw` a ser gravado a partir de { dial, local }.
 *  - Brasil: aplica a máscara BR e grava SEM "+" (idêntico ao comportamento antigo).
 *  - Outro: grava o texto livre como o casal digitou (deve conter o "+DDI").
 *  - Demais países: "+DDI dígitos".
 */
export function serializePhoneValue(dial: string, local: string): string {
  const trimmed = String(local ?? '').trim()

  if (dial === '55') return formatPhoneBR(trimmed)
  if (dial === OTHER_DIAL) return trimmed

  const digits = trimmed.replace(/\D/g, '')
  return digits ? `+${dial} ${digits}` : ''
}
