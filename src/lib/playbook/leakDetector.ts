/**
 * leakDetector — analisa texto de pergunta/âncora pra detectar conteúdo
 * que pode violar boundaries do agente.
 *
 * Uso na UI: warnings inline pra admin enxergar antes de salvar.
 * NÃO bloqueia save — só sinaliza. Admin tem palavra final.
 *
 * Padrões cobertos (ordem de severidade):
 *   - price: cita valor monetário ou faixa (R$ X, X mil, X k, "atendemos de Y a Z")
 *   - leading_examples: cita destinos/itens do catálogo (vies de ancoragem)
 *   - therapeutic: linguagem suavizadora ("é super normal", "fica tranquilo")
 *
 * Padrão arquitetônico: regex curtos e bem nomeados, severity enum,
 * mensagem clara sobre POR QUE pode dar problema.
 */

export type LeakSeverity = 'high' | 'medium' | 'low';

export interface LeakWarning {
  /** Categoria do leak detectado. */
  type: 'price' | 'leading_examples' | 'therapeutic' | 'discount' | 'promise';
  severity: LeakSeverity;
  /** Trecho da string que disparou (substring exato). */
  match: string;
  /** Por que é problema, em 1 frase pro admin. */
  reason: string;
  /** Sugestão concreta de como reescrever (opcional). */
  suggestion?: string;
}

/**
 * Padrões de detecção de menção a preço/valor monetário.
 * Cobre: R$ explícito, "X mil", "Xk", "Y reais", faixas "de A a B", "entre A e B".
 */
const PRICE_PATTERNS: Array<{ re: RegExp; reason: string; suggestion?: string }> = [
  {
    re: /R\$\s?\d/i,
    reason: 'Cita valor monetário (R$). A maioria dos agentes tem boundary "nunca falar preço" — esta pergunta vai ancorar o lead.',
    suggestion: 'Remova o valor. Pergunte sobre "faixa de investimento" sem mostrar números seus.',
  },
  {
    re: /\b\d{2,3}\s*(mil|milh[ãa]o|milh[oõ]es|k)\b/i,
    reason: 'Cita valor em "mil" ou "k". Mesmo trade-off de boundary "nunca falar preço".',
    suggestion: 'Pergunte a faixa do casal sem expor a sua. Ex: "Já conversaram alguma faixa que faça sentido?"',
  },
  {
    re: /\bde\s+\d{2,}\s+(mil|k|reais).{0,40}(at[ée]|a)\s+\d{2,}/i,
    reason: 'Mostra a SUA faixa de mercado (ex: "atendemos de 50 mil até 500 mil"). Anchoring clássico — lead vai dar número dentro/abaixo da faixa.',
    suggestion: 'Tire a faixa. A pergunta funciona sem ela: "Já conversaram alguma faixa que faça sentido pra vocês?"',
  },
  {
    re: /\batendemos\s+de\b/i,
    reason: '"Atendemos de X" tipicamente vem seguido de faixa de preço. Verifique se tem valor escondido.',
  },
];

/**
 * Padrões de "leading examples" — cita opções específicas que podem
 * enviesar a resposta do lead pra opção mais bem pontuada na qualificação.
 *
 * Lista expansível. Foco em destination wedding (caso Estela), mas
 * a função aceita lista custom via parâmetro `leadingTerms`.
 */
const DEFAULT_LEADING_TERMS = [
  // Destinos premium (alto peso de scoring)
  'Caribe', 'Cancún', 'Cancun', 'Riviera Maya', 'Tulum', 'Punta Cana', 'Aruba',
  'Maldivas', 'Bahamas',
  'Nordeste', 'Trancoso', 'Jericoacoara', 'Fernando de Noronha',
  'Mendoza', 'Argentina',
  // Termos de luxo/anchor
  'premium', 'luxo', 'high-end', 'top de linha',
];

const THERAPEUTIC_PATTERNS: Array<{ re: RegExp; reason: string; suggestion?: string }> = [
  {
    re: /\bé\s+super\s+normal\b/i,
    reason: 'Linguagem terapêutica ("é super normal"). Pode soar paternalista — a maioria dos agentes pede tom sóbrio.',
  },
  {
    re: /\bfica\s+tranquil[oa]\b/i,
    reason: '"Fica tranquilo/a" é padrão terapêutico evitado. Soa como tentar acalmar problema que o lead não levantou.',
  },
  {
    re: /\bn[ãa]o\s+se\s+preocupe\b/i,
    reason: '"Não se preocupe" pode plantar a preocupação que não existia.',
  },
];

const DISCOUNT_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\bdesconto/i,
    reason: 'Menção a desconto. Maioria dos agentes não negocia desconto via SDR — pode criar expectativa.',
  },
  {
    re: /\bprom[oç][aã]o/i,
    reason: 'Menção a promoção. Verifique se está alinhado ao tom da marca.',
  },
];

const PROMISE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\bgarantimos\b/i,
    reason: 'Promessa de garantia. SDR não deveria garantir entregáveis — passa pra closer.',
  },
  {
    re: /\bvocê\s+vai\s+(adorar|amar|gostar)\b/i,
    reason: 'Promessa de experiência subjetiva. Pode soar exagerada e furar o tom sóbrio.',
  },
];

/**
 * Detecta leaks em um texto de pergunta/âncora.
 *
 * @param text — texto a analisar
 * @param leadingTerms — termos específicos do agente que podem enviesar
 *   (ex: destinos do catálogo). Se omitido, usa lista default.
 * @returns lista de warnings (vazia se texto está limpo)
 */
export function detectLeaks(
  text: string | null | undefined,
  leadingTerms: string[] = DEFAULT_LEADING_TERMS,
): LeakWarning[] {
  if (!text || typeof text !== 'string') return [];
  const t = text.trim();
  if (!t) return [];

  const warnings: LeakWarning[] = [];

  for (const p of PRICE_PATTERNS) {
    const m = t.match(p.re);
    if (m) {
      warnings.push({
        type: 'price',
        severity: 'high',
        match: m[0],
        reason: p.reason,
        suggestion: p.suggestion,
      });
    }
  }

  for (const p of THERAPEUTIC_PATTERNS) {
    const m = t.match(p.re);
    if (m) {
      warnings.push({
        type: 'therapeutic',
        severity: 'medium',
        match: m[0],
        reason: p.reason,
        suggestion: p.suggestion,
      });
    }
  }

  for (const p of DISCOUNT_PATTERNS) {
    const m = t.match(p.re);
    if (m) {
      warnings.push({
        type: 'discount',
        severity: 'medium',
        match: m[0],
        reason: p.reason,
      });
    }
  }

  for (const p of PROMISE_PATTERNS) {
    const m = t.match(p.re);
    if (m) {
      warnings.push({
        type: 'promise',
        severity: 'medium',
        match: m[0],
        reason: p.reason,
      });
    }
  }

  // Leading examples — busca termos específicos como palavra inteira (case-insensitive)
  for (const term of leadingTerms) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const m = t.match(re);
    if (m) {
      warnings.push({
        type: 'leading_examples',
        severity: 'low',
        match: m[0],
        reason: `Cita "${m[0]}" como exemplo. Pode enviesar o lead a responder o que você sugeriu (especialmente se "${m[0]}" tem peso alto na qualificação).`,
        suggestion: 'Remova exemplos específicos. Pergunte aberta — "já têm uma região em mente?" — e deixe o lead trazer.',
      });
    }
  }

  // Dedupe por match (caso o mesmo trecho dispare múltiplos patterns)
  const seen = new Set<string>();
  return warnings.filter(w => {
    const key = `${w.type}:${w.match.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
