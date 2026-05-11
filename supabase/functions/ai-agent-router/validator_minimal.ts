// Validador minimal determinístico. SEM LLM. SEM reescrita.
// Detector que decide PUBLICAR | REGEN | ESCALAR.
// 6 regras regex/string match de baixo falso-positivo.
//
// Substitui o validator LLM antigo (que reescrevia respostas certas).
// Apenas DECIDE — protocolo REGEN está em index.ts (chama Persona de novo
// com bloco XML <previous_attempt_failed> injetado pelo buildRegenHintBlock).

export interface ValidatorInput {
  response: string;
  turn_count: number; // 1 = primeira mensagem
}

export interface RedLineHit {
  rule: string;
  match: string;
  instruction: string; // hint pra Persona corrigir na 2ª passagem
}

export interface ValidatorVerdict {
  decision: "PUBLICAR" | "REGEN" | "ESCALAR";
  red_lines_hit: RedLineHit[];
  reason?: string;
}

const RULES: Array<{
  id: string;
  test: (input: ValidatorInput) => string | null;
  instruction: string;
}> = [
  {
    id: "never_dash_separator",
    instruction: "Reformule SEM travessões (—, –). Use vírgula, ponto ou reticências.",
    test: ({ response }) => {
      const m = response.match(/[—–]/);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_emoji_first",
    instruction: "Reformule SEM emoji — é a primeira mensagem da conversa, sem rapport ainda.",
    test: ({ response, turn_count }) => {
      if (turn_count !== 1) return null;
      // Detecta emoji unicode (cobre a maioria dos blocos comuns)
      const m = response.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_transfer_explicit",
    instruction: "Reformule SEM dizer 'vou passar' / 'vou transferir' / 'outra pessoa vai te atender'. Handoff é invisível.",
    test: ({ response }) => {
      const m = response.match(/(vou\s+(passar|transferir)|outra\s+pessoa\s+(vai|irá)\s+te\s+(atender|responder))/i);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_price",
    instruction: "Reformule SEM mencionar preço, valor em reais ou faixa. Quem fala preço é a Wedding Planner.",
    test: ({ response }) => {
      const m = response.match(/\b(R\$\s*\d|\d+\s*(mil|k)\s+reais?|preço\s+é|custa\s+R?\$)/i);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_self_clarify",
    instruction: "Reformule SEM tentar 'esclarecer' a pergunta do lead. Se a mensagem foi ambígua, peça pra explicar de forma direta — não autoexplique.",
    test: ({ response }) => {
      const m = response.match(/(só\s+pra\s+(eu|a\s+gente)\s+(entender|confirmar|saber)|deixa\s+eu\s+(entender|confirmar)|pra\s+(eu|gente)\s+(saber|entender)\s+direitinho)/i);
      return m?.[0] ?? null;
    },
  },
  {
    id: "never_meta_question",
    instruction: "Reformule SEM falar 'sua pergunta' ou 'você quer saber se'. Responda direto, não meta-comunique.",
    test: ({ response }) => {
      const m = response.match(/(sua\s+pergunta:?\s*[\wÀ-ÿ]|você\s+(quer|está)\s+(saber|perguntando)\s+se)/i);
      return m?.[0] ?? null;
    },
  },
];

export function runValidatorMinimal(input: ValidatorInput): ValidatorVerdict {
  const hits: RedLineHit[] = [];

  for (const rule of RULES) {
    const match = rule.test(input);
    if (match) {
      hits.push({
        rule: rule.id,
        match,
        instruction: rule.instruction,
      });
    }
  }

  return {
    decision: hits.length > 0 ? "REGEN" : "PUBLICAR",
    red_lines_hit: hits,
  };
}

// Helper pra construir o bloco <previous_attempt_failed> injetado no
// prompt da 2ª passagem (REGEN). Estruturado em XML — não texto livre.
// Caller (index.ts) injeta logo antes do <turn>.
export function buildRegenHintBlock(verdict: ValidatorVerdict): string {
  if (verdict.red_lines_hit.length === 0) return "";
  const first = verdict.red_lines_hit[0];
  return `<previous_attempt_failed>
  <rule>${first.rule}</rule>
  <excerpt>${escapeXml(first.match)}</excerpt>
  <instruction>${escapeXml(first.instruction)}</instruction>
</previous_attempt_failed>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
