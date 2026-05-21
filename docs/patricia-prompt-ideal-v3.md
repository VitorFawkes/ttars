# Patricia — Prompt-First Ideal v3

> **Status:** Sessão 1 de [estou-com-receio-do-scalable-hare.md](file:///Users/vitorgambetti/.claude/plans/estou-com-receio-do-scalable-hare.md). Documento de DESIGN, sem código. Aguarda aprovação do Vitor antes de qualquer mudança em produção.
>
> **Data:** 2026-05-21.

---

## Resumo executivo (30 segundos)

1. O Vitor já escreveu um **prompt-first quase ideal** pra Patricia em 2 campos do banco: `identity_config.principles_text` (9.614 chars) + `prompts_extra.context` (2.517 chars). É texto fluido, primeira pessoa, com exemplos concretos.
2. O agente anterior **pegou esse texto e fragmentou em 12 cards + 5 routines + 8 rules** pra encaixar em UI. Resultado: prompt da Patricia hoje é Lego em vez de texto coerente.
3. O texto-fonte original está salvo em [docs/patricia-redesign/baseline-2026-05-21/](file:///Users/vitorgambetti/Documents/WelcomeCRM/docs/patricia-redesign/baseline-2026-05-21/) — **não joga fora**.
4. Proposta: voltar pro monolítico (no código, não no banco) + estruturar APENAS o que admin realmente precisa editar (números, toggles, alguns nomes).

---

## 1. O que tá rodando HOJE (estado real, capturado em 2026-05-21)

Patricia em prod (`4d96d9b4-e909-4441-bd85-d3f807cccfa7`, ativa=false, whitelist com 39 números de teste):

| Bloco do prompt | Fonte usada hoje | Fonte LEGADA no banco (dead weight) | Hardcoded no código |
|---|---|---|---|
| `<principles>` | `identity_config.principles[]` (NOVO — **12 items fragmentados**) | `identity_config.principles_text` (LEGADO — 9.614 chars, texto fluido) | — |
| `<context_rules>` | `cognitive_audit_config` (NOVO — **5 routines fragmentadas**) | `prompts_extra.context` (LEGADO — 2.517 chars, DIFF COGNITIVO inteiro) | `DEFAULTS` por routine em prompt_assembler.ts:477-503 |
| `<data_update_rules>` | `data_update_rules[]` (NOVO — **8 items fragmentados**) | `prompts_extra.data_update` (LEGADO — 3.312 chars) | — |
| `<boundaries>` | `boundaries_config.library_active` (LEGADO — 16 IDs) | `boundaries_config.by_category` (NOVO — VAZIO) | `LIBRARY_DESCRIPTIONS` 16 textos em prompt_assembler.ts:658-676 |
| Tool descriptions | `tool_descriptions` (VAZIO) | — | `DEFAULT_TOOL_DESCRIPTIONS` |
| `handoff_actions.auto_handoff_invisible` | NULL | — | defaults 3/5/true em index.ts:744-745 |

**Tradução:** prompt da Patricia hoje é uma **mistura de 3 fontes diferentes** (UI fragmentada + LEGADO ainda no banco + hardcoded). O `principles_text` original do Vitor virou dead weight (não é lido), mas continua no banco. Boundaries continua 100% legado/hardcoded.

---

## 2. Texto-fonte que o Vitor escreveu — ouro (não jogar fora)

### 2.1 principles_text (9.614 chars) — "COMO EU PENSO"

Salvo em [baseline-2026-05-21/principles_text-FONTE-VITOR.md](file:///Users/vitorgambetti/Documents/WelcomeCRM/docs/patricia-redesign/baseline-2026-05-21/principles_text-FONTE-VITOR.md).

Por que é ouro:
- **Primeira pessoa fluida** — "Eu não invento o que não sei", "Eu sou minhas restrições, não as escondo". Lê como uma pessoa pensando, não como um manual.
- **Exemplos concretos** — Punta Cana com resorts; "1 EUR ≈ R$ 6, 1 USD ≈ R$ 5"; faixas R$ 800/R$ 1.200 por convidado; Caribe/Maldivas/Nordeste como rede própria.
- **Dados de verdade** — Ana Carolina Kuss (Wedding Planner), 99% das tratativas online, escritório em Curitiba, time presencial no dia da festa.
- **Boundaries narrados como decisão de marca** — "sábado à noite a gente normalmente fecha pra manter foco em casamento durante a semana mesmo".
- **9 pontos finais sobre rede, prazo, acompanhamento, lua de mel, materiais** — tudo com nuance.

### 2.2 prompts_extra.context (2.517 chars) — "DIFF COGNITIVO"

Salvo em [baseline-2026-05-21/context-DIFF-COGNITIVO.md](file:///Users/vitorgambetti/Documents/WelcomeCRM/docs/patricia-redesign/baseline-2026-05-21/context-DIFF-COGNITIVO.md).

Por que é ouro:
- Define **5 auditorias por turno** num bloco coeso (PROMESSAS PENDENTES, CONTRADIÇÕES, PEDIDOS NÃO RESPONDIDOS, VIABILIDADE, SATURAÇÃO DE PITCH).
- Dá **valores concretos** — "< R$ 800 = abaixo_minimo_resistente", "entre R$ 800-1.200 = fronteira_defensiva", "≥ 2 ocorrências em 5 turnos = pitch_saturado".
- Já está no formato XML-friendly (auditoria → registrar em `campo_x`).

### 2.3 prompts_extra.data_update (3.312 chars) — regras de gravação

Salvo em [baseline-2026-05-21/data_update.md](file:///Users/vitorgambetti/Documents/WelcomeCRM/docs/patricia-redesign/baseline-2026-05-21/data_update.md).

Esse aqui é meio diferente — boa parte deveria virar **código real do validator** (não prompt). Já existe o esqueleto disso no commit `ae7bec55` (cerca de segurança real com allowlist/denylist).

---

## 3. Proposta de estrutura do prompt v3

### 3.1 Ordem dos blocos (mantém a ordem otimizada já existente)

```
<identity>             ← header curto: nome, missão, descrição da Welcome (do business_config)
<principles>           ← TEXTO MONOLÍTICO (principles_text restaurado, ~9.500 chars)
<agent_schedule>       ← gerado de scheduling_config (já funciona bem)
<voice>                ← gerado de voice_config (já funciona bem)
<boundaries>           ← TEXTO MONOLÍTICO (boundaries narradas no <principles> + lista curta de produto)
<data_update_rules>    ← REMOVER do prompt. Mover pro validator real.
<context_rules>        ← TEXTO MONOLÍTICO (DIFF COGNITIVO restaurado, ~2.500 chars)
<playbook>             ← já funciona, mantém
<listening>            ← gerado de listening_config (já funciona)
<state> + <qualification_result> + <proposed_slots> + <tool_results>   ← contexto dinâmico do turno
<silent_signals>       ← restruturado (toggle + chips, sem textarea)
<qualification>        ← regras de scoring (referência)
<examples>             ← few-shot real (ver pergunta 3 ao Vitor)
<turn_policy>          ← comando do turno
<tools>                ← lista das tools, descrições HARDCODED no código
<output_format>        ← schema reminder
```

### 3.2 Onde cada bloco mora

| Bloco | Mora em | Quem edita |
|---|---|---|
| `<identity>` (header) | Config `business_config.company_name`, `identity_config.mission_one_liner`, `identity_config.role` | Admin (campos simples — input curto) |
| `<principles>` | **CONSTANTE em código** — `supabase/functions/ai-agent-router-v2/defaults/patricia_principles.ts` | Engenharia (PR no git) |
| `<agent_schedule>` | Config `scheduling_config` | Admin (janelas, dias, duração) |
| `<voice>` | Config `voice_config` (tone_tags, formality, rules, typical_phrases, forbidden_phrases) | Admin (chips + toggles + listas curtas) |
| `<boundaries>` | **CONSTANTE em código** — `defaults/patricia_boundaries.ts` (texto narrativo curto + lista das 16 linhas vermelhas). | Engenharia. Admin pode adicionar 1 "linhas extras do produto" como input curto. |
| `<context_rules>` (DIFF COGNITIVO) | **CONSTANTE em código** — `defaults/patricia_diff_cognitivo.ts`. | Engenharia. Admin tem APENAS toggles ON/OFF por auditoria + edita as zonas/cotações (números). |
| `<data_update_rules>` | **CÓDIGO REAL no validator** (`brand_validator.ts` + `index.ts` cerca de segurança) — não vai pro prompt. | Engenharia. Admin edita allowlists em `ai_agent_business_config` (já existe). |
| Tool descriptions | Constante `DEFAULT_TOOL_DESCRIPTIONS`. UI deletada. | Engenharia. |
| Auto-handoff threshold | Config `handoff_actions.auto_handoff_invisible` | Admin (slider numérico). |

### 3.3 Estimativa de tamanho do prompt final

- Hoje (Frankenstein): ~28k chars (estimativa, com 12 principles + 5 routines + 8 rules + 16 boundaries + texto narrativo)
- Proposto (monolítico v3): ~18k chars
- Ganho: prompt 40% menor, mais coerente, melhor atenção do LLM

---

## 4. Comparação direta — principles fragmentado vs principles monolítico

**Hoje (fragmentado, gerado pelo `renderPrinciples` novo):**

```xml
<principles>
1. **Eu não invento o que não sei** — Nome, prazo, valor, horário, pessoa — se não está no que eu recebi, eu não preencho a lacuna. "Não tenho essa informação aqui" é resposta legítima.

2. **Eu sou minhas restrições, não as escondo** — A janela exata da minha agenda chega no bloco <agent_schedule> injetado pelo engine — eu leio dali, não confabulo...

...12 cards similares...
</principles>
```

**Proposto (monolítico, voltando pro principles_text):**

```xml
<principles>
COMO EU PENSO (princípios que organizam tudo o que eu faço)

1. Eu não invento o que não sei. Nome, prazo, valor, horário, pessoa — se não está no que eu recebi, eu não preencho a lacuna. "Não tenho essa informação aqui" é resposta legítima.

2. Eu sou minhas restrições, não as escondo. A janela exata da minha agenda chega no bloco <agent_schedule> injetado pelo engine — eu leio dali, não confabulo. Quando o casal pede fora da janela, eu trato como escolha comercial da Welcome, não como incapacidade: "sábado à noite a gente normalmente fecha pra manter foco em casamento durante a semana mesmo — deixa eu checar com a Ana Carolina se rola exceção pra vocês".

...texto contínuo, 9 pontos numerados, com bloco final "DADOS DO MEU CONTEXTO QUE SÃO VERDADE"...
</principles>
```

**Diferença real:** o monolítico carrega contexto narrativo entre os pontos (a frase do sábado à noite, exemplos de Punta Cana, Ana Carolina). O fragmentado força corte abrupto entre items.

---

## 5. Decisões tomadas (Vitor — 2026-05-21)

### Decisão 1 — Texto-fonte é representativo. Restaurar como base.

**Resposta:** Sim. O `principles_text` (9.614 chars) e o `context` (2.517 chars) salvos em [baseline-2026-05-21/](file:///Users/vitorgambetti/Documents/WelcomeCRM/docs/patricia-redesign/baseline-2026-05-21/) viram a fonte de verdade do prompt v3. Iteração futura é em cima deles, não do zero.

### Decisão 2 — Few-shot fica VAZIO até ter conversa real.

**Resposta:** Vitor não tem conversa real anonimizada disponível e alertou "tome MUITO cuidado com isso".

**Implicação:** Bloco `<examples>` no prompt v3 sai vazio (ou nem é renderizado). NUNCA inventar conversa fictícia. **Bloqueador pra ativar Patricia em prod:** coletar 1+ conversa real anonimizada antes de virar `ativa=true`. Anotado em [feedback_fewshot_real_only.md](file:///Users/vitorgambetti/.claude/projects/-Users-vitorgambetti-Documents-WelcomeCRM/memory/feedback_fewshot_real_only.md).

Calibração de tom enquanto isso: já existe via `voice.typical_phrases`, `voice.forbidden_phrases`, `voice.rules`, regionalismos. Não precisa few-shot agora.

### Decisão 3 — Boundaries: separar por CONTROLE de leigo.

**Resposta:** "Você entende o conceito de CONTROLE e feito por uma pessoa leiga, com isso tome a decisão."

**Princípio aplicado:** separar boundaries em 2 grupos pela NATUREZA da decisão (anotado em [feedback_controle_admin_leigo.md](file:///Users/vitorgambetti/.claude/projects/-Users-vitorgambetti-Documents-WelcomeCRM/memory/feedback_controle_admin_leigo.md)):

**Grupo A — boundaries de marca/negócio (admin controla via UI estruturada):**

| Boundary | Como admin controla | Por quê |
|---|---|---|
| Mencionar preço/valor | Toggle ON/OFF | Decisão comercial — alguns clientes podem mudar política |
| Mencionar IA/robô | Toggle ON/OFF | Decisão de marca |
| Mencionar concorrente | Lista editável (chips com nomes) | Admin sabe quais concorrentes evitar |
| Prometer prazo específico | Toggle ON/OFF | Operacional |
| Negociar por escrito | Toggle ON/OFF | Operacional |
| Material/brochura pra enviar | Toggle ON/OFF + texto curto "o que falar se pedir" | Pode mudar (hoje não tem material; amanhã pode ter) |

**Grupo B — boundaries de design da IA (fica em código, invisível pro admin):**

- Nunca repetir info que lead já deu
- Nunca repetir as mesmas palavras 2 turnos seguidos
- Nunca empilhar perguntas sobre temas diferentes
- Nunca assumir resposta na pergunta
- Nunca pedir dado já no card
- Nunca justificar excessivamente uma pergunta
- Nunca culpar o cliente
- Nunca usar travessões (—) como separador
- Zero emoji na primeira mensagem
- ZERO emoji se voice.emoji_policy=never
- Nunca usar clichês ("casamento dos sonhos", "deixe conosco")

Esses 11 ficam HARDCODED em `defaults/patricia_boundaries_design.ts`. Admin não tem motivo de mexer — são qualidade técnica do prompt. Se admin "desativar nunca repetir info", a IA fica ruim e admin não tem ferramenta pra avaliar isso.

**No prompt final:**
- `<boundaries>` renderiza primeiro o Grupo A (toggles ativos do admin, com nomes do admin no caso de concorrentes) + Grupo B inteiro como bloco fixo abaixo.
- Texto curto, lista visual — leigo lê e entende: "ah, a Patricia nunca fala preço, nunca menciona IA, nunca menciona Decoração Sofia (concorrente), e segue qualidade técnica do prompt".

### Decisão 4 — Matar V2 do editor.

**Resposta:** Mata.

**Implicação:** Eliminar:
- Toggle "Experimentar UI nova" em `TabPlaybook.tsx:92-106`
- Hook `useV3Layout()`
- Branches `if (v3)` / `else` em todas as sections do playbook
- Sections V2 que foram duplicadas (`IdentitySection` legado, `VoiceSection` v2, `MomentsSection` v2, etc.)

Patricia (e qualquer agente V2 futuro) usa só o layout V3. Estela continua V1 isolada (não afetada).

---

## 6. Próximos passos depois da aprovação

Quando Vitor responder as 4 perguntas, eu sigo direto pra:

1. **Sessão 2** (re-mapear destino de cada config) — já tem proposta na §3.2 acima
2. **Sessão 3** (migração de dados — eliminar duplo prompt) — SQL + atualização do prompt_assembler.ts
3. **Sessão 4** (UI cleanup) — deletar componentes que viraram dead code
4. **Sessão 5** (validação — comparar prompt assembled antes/depois)
5. **Sessão 6** (ativação)

Cada sessão é PR separado, com preview Vercel, pra Vitor avaliar visualmente antes de subir.

---

## 7. Arquivos relacionados

- Plano master: [estou-com-receio-do-scalable-hare.md](file:///Users/vitorgambetti/.claude/plans/estou-com-receio-do-scalable-hare.md)
- Baseline completo do estado atual: [baseline-2026-05-21/](file:///Users/vitorgambetti/Documents/WelcomeCRM/docs/patricia-redesign/baseline-2026-05-21/)
- Memória do projeto: `feedback_no_raw_prompts_in_ui.md`, `feedback_prompt_first_design.md`, `feedback_estela_patricia_nunca_misturar.md`
