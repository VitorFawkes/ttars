# Estela — Redesign de Sondagem, Validador e Observabilidade

**Data:** 2026-05-11
**Escopo:** Somente Estela (engine `multi_agent_pipeline`).
**Fora de escopo:** Patricia (engine `single_agent_v2`) — experimento paralelo, isolado por design. Luna (V1, desligada) — afetada indiretamente pelo código compartilhado mas não testada nesse spec.

## 1. Context

Hoje (2026-05-11 às 15:31 BR), a Estela respondeu à mensagem "Em Fevereiro de 2028" do casal com uma frase alucinada: _"Que bom que fevereiro de 2028 já está no radar. Só pra eu entender direitinho a sua pergunta: você quer saber se vocês precisam ter feito alguma viagem internacional específica no último ano para casar fora, ou está perguntando se nós, da Welcome, já sabemos o histórico de viagens internacionais de vocês?"_.

A investigação determinística (conversa `b60b3e0f-05f3-4b04-b61b-c2bc0ea3fc66`, turn `73167143-063d-4218-a2f3-62c444ca224a`) identificou três falhas estruturais que coexistem hoje na pipeline da Estela:

1. **`deriveSlotQuestion()` em `supabase/functions/ai-agent-router/prompt_builder_v2.ts:414-461`** transforma `must_collect` em pergunta literal via template determinístico. Funciona quando `must_collect` é lista atômica (`["mês", "ano"]`) mas produz frases gramaticalmente quebradas quando contém descrição livre. A frase quebrada é injetada no prompt com instrução "use PALAVRA-POR-PALAVRA" — o LLM tenta reformular e gera alucinação.
2. **Validador atual** (gpt-5.1 t=0.1, baseado em LLM-rewrites configuradas em `ai_agents.validator_rules[]`) foi efetivamente desativado por ter histórico de reescrever respostas corretas. Reverts às 14:56 hoje (`6f1b6fcc`, `99effde5`) trouxeram o modo "EDITOR" mais frouxo, que tolera alucinação estrutural.
3. **Observabilidade ausente** — `ai_conversation_turns.context_used` está vindo `{}` e a resposta crua do LLM (antes de Formatter) não é persistida. Sem isso, qualquer auditoria pós-fato vira arqueologia.

O fix imediato (popular `questions[]` do slot `info_3d8u`) foi aplicado em produção (`20260511j_estela_fix_viagem_internacional_slot.sql`), mas trata o sintoma. Esse spec ataca as três causas estruturais.

**Outcome desejado:** a classe inteira de bugs onde "config inocente do admin gera prompt nonsense" desaparece. Validador volta a operar com regras de baixo falso-positivo. Toda turn da Estela é auditável.

## 2. Escopo e isolamento

| Componente | Estela (V1) | Patricia (V2) | Luna (V1, off) |
|---|---|---|---|
| Engine | `multi_agent_pipeline` | `single_agent_v2` | `multi_agent_pipeline` |
| Router | `ai-agent-router/` | `ai-agent-router-v2/` (intocado) | `ai-agent-router/` (intocado) |
| `prompt_builder_v2.ts` | **modificado** | não usa | usa (não testada) |
| `discovery_config` no banco | **schema estendido** | tem campos antigos, ignora no runtime | usa (não testada) |
| `ai_agent_turn_logs` (novo) | **escreve** | não escreve | escrevia se reativada |
| UI Pipeline Studio | **UI nova (4 campos)** | UI antiga (preserved) | UI antiga (preserved) |

**Regra:** toda alteração de UI ou hooks que renderizam editor de slot **DEVE** discriminar por `agent.engine` ou `agent.id`. Patricia continua vendo a UI antiga (`must_collect`/`questions`/`coverage_notes`/`reject_if`). Estela ganha a UI nova (`goal`/`must_include`/`example_questions`/`literal_question` + `reject_if` preservado).

**Risco residual Luna:** mudanças em `prompt_builder_v2.ts` afetam Luna se reativada. Sem testes E2E pra Luna hoje. Antes de qualquer reativação dela, validar o caminho `deriveSlotQuestion` legado + slots da Luna.

## 3. Schema novo do slot (aditivo, não destrutivo)

`ai_agent_moments.discovery_config.slots[]` ganha 4 campos opcionais. Campos antigos permanecem (deprecated, lidos só em fallback).

### 3.1 Estrutura

```jsonc
{
  // ───── existentes (mantidos) ─────
  "key": "info_3d8u",
  "label": "Viagens Internacionais no último ano",
  "icon": "V",
  "priority": "nice_to_have",
  "required": false,
  "crm_field_key": "ww_sdr_perfil_viagem_internacional",
  "reject_if": [],

  // ───── novos (4 campos opcionais) ─────
  "goal": "Descobrir se o casal viajou internacionalmente fora da América do Sul no último ano. Sinal de poder aquisitivo.",
  "must_include": [],
  "example_questions": [
    "E só uma curiosidade, vocês viajaram internacionalmente esse último ano?"
  ],
  "literal_question": null,

  // ───── deprecated (mantidos pra compat com Patricia/Luna) ─────
  "must_collect": [],
  "questions": [],
  "coverage_notes": null
}
```

### 3.2 Semântica de cada campo novo

| Campo | Tipo | Obrigatório | Significado |
|---|---|---|---|
| `goal` | string | sim (quando schema novo é usado) | Objetivo do slot em texto livre. O LLM lê isto para entender o que precisa cobrir. Não é renderizado como pergunta. |
| `must_include` | string[] | não | Lista atômica de elementos que a pergunta DEVE cobrir (ex: `["mês", "ano"]`). Não suporta frases descritivas — admin é instruído na UI. |
| `example_questions` | string[] | não | 1–3 perguntas que servem como REFERÊNCIA DE TOM. O LLM NÃO copia literal; usa como sample de voz/abordagem. |
| `literal_question` | string \| null | não | Pergunta exata que o LLM deve usar **sem adaptar**. Override total — quando preenchida, ignora `must_include` e `example_questions`. Reservada pra slots cirúrgicos (confirmação de agenda com link, etc). |

### 3.3 Detecção: schema novo vs schema antigo

Backend lê: **se `goal` ≠ null e ≠ ""**, slot está em modo "novo". Senão, fallback para o modo antigo (`questions`/`must_collect`/`coverage_notes`/`deriveSlotQuestion`).

Esse switch garante coexistência. Migração dos 6 slots da Sondagem da Estela popula `goal` em todos eles — a partir daí, Estela rumo full schema novo.

## 4. Hierarquia de injeção no prompt

A função `renderSlotForPrompt(slot)` em `prompt_builder_v2.ts` substitui o caminho atual de slot e respeita a ordem de mais específico → mais livre:

```
SE slot.goal ≠ null E ≠ "":
    SE slot.literal_question ≠ null E ≠ "":
        → injeta: "Pergunta exata a fazer: \"<literal_question>\". Use textualmente, sem adaptar."
        → ignora must_include, example_questions
    SENÃO SE slot.must_include não-vazio:
        → injeta: "Objetivo: <goal>. A pergunta DEVE coletar EXATAMENTE: <items joined>. Formule natural."
        → se example_questions não-vazio, adiciona: "Referência de tom (não copiar literal): <list>."
    SENÃO SE slot.example_questions não-vazio:
        → injeta: "Objetivo: <goal>. Referência de tom (não copiar literal): <list>."
    SENÃO:
        → injeta: "Objetivo: <goal>. Formule a pergunta natural seguindo voice config e contexto da conversa."
SENÃO (schema antigo — fallback Patricia/Luna):
    → caminho atual: must_collect → coverage_notes → deriveSlotQuestion → label
```

### 4.1 Por que essa hierarquia

- `literal_question` é o controle máximo. Casos legítimos: confirmação de agenda com slots calculados, frases regulatórias, scripts compliance. Não deve ser a regra.
- `must_include` cobre o caso "data": precisa coletar EXATAMENTE mês e ano. Liberdade de forma, mas conteúdo travado.
- `example_questions` cobre o caso "viagem internacional": admin tem ideia do tom certo, mas confia no LLM pra adaptar à conversa.
- `goal` puro cobre o caso "destino" ou "convidados": o objetivo é claro, voice config + few-shots globais bastam.

### 4.2 O que NÃO está no prompt

Os exemplos NÃO entram com prefixo "Use uma destas:". Entram com prefixo "Referência de tom (não copiar literal):". Isso evita que o LLM colapse pra cópia mecânica.

`goal` NUNCA é parafraseado pelo backend. Vai literal no prompt — é texto do admin, não material a processar.

## 5. Migração dos 6 slots atuais da Sondagem

Migration SQL (`supabase/migrations/20260512X_estela_sondagem_slots_v2.sql`) popula `goal` + opcionais nos 6 slots, mantendo campos antigos. Mapeamento:

| Slot key | goal (novo) | must_include | example_questions | literal_question |
|---|---|---|---|---|
| `data` | "Saber o mês e o ano do casamento" | `["mês", "ano"]` | `[]` | `null` |
| `destino` | "Saber a região ou país que o casal tem em mente" | `[]` | `["E sobre o destino, já têm uma região ou país em mente?"]` | `null` |
| `convidados` | "Saber quantos convidados realmente vão comparecer (taxa de presença é menor em destination)" | `[]` | `["Dos convidados, quantos vocês acreditam que realmente vão? Destination wedding costuma ter taxa de presença diferente de casamento na cidade."]` | `null` |
| `investimento` | "Saber a faixa de investimento ideal e o máximo que o casal pode investir" | `[]` | `["Sobre o investimento: qual é o valor que vocês desejam investir e o máximo que podem chegar?"]` | `null` |
| `info_3d8u` | "Descobrir se o casal viajou internacionalmente fora da América do Sul no último ano. Sinal de poder aquisitivo." | `[]` | `["E só uma curiosidade, vocês viajaram internacionalmente esse último ano?"]` | `null` |
| `info_779o` | "Descobrir se a família vai ajudar financeiramente no casamento. Sinal de co-financiamento." | `[]` | `["E sobre o investimento, é algo que vocês irão fazer por conta própria ou tem apoio da família?"]` | `null` |

Migration NÃO toca em `questions`/`must_collect`/`coverage_notes` dos slots — mantém o legado intacto pra rollback fácil.

**Revisão admin pós-migration:** Vitor abre Pipeline Studio em staging, edita cada slot na UI nova, confirma `goal`/`example_questions` por slot, ajusta tom se preciso. Após o OK, promove pra produção.

## 6. Validador minimal (regex/string match)

### 6.1 O que é deletado

Validador LLM atual (`runValidator` em `index.ts:3260-3395`) é **substituído**. Sai:
- Chamada gpt-5.1 t=0.1
- 11 regras configuráveis em `ai_agents.validator_rules[]` operando via LLM
- Ação `correct` (reescrita inline) — sumida em definitivo
- Ação `block` LLM-based — sumida em definitivo

### 6.2 O que entra

Função `runValidatorMinimal(response, context): ValidatorVerdict` 100% determinística. Sem LLM. Sem reescrita.

```typescript
type ValidatorVerdict = {
  decision: 'PUBLICAR' | 'REGEN' | 'ESCALAR'
  red_lines_hit: Array<{ rule: string; match: string }>
  reason?: string
}
```

### 6.3 Regras (6 inicialmente, escolhidas por baixo falso-positivo)

| Rule ID | Pattern | Action | Justificativa |
|---|---|---|---|
| `never_dash_separator` | regex `[—–]` (em-dash, en-dash) | REGEN | Boundary explícita em voice_config (`uses_dashes=false`) |
| `never_emoji_first` | response contém qualquer emoji E `turn_count === 1` | REGEN | Boundary explícita em voice_config (`emoji_policy=after_rapport`) |
| `never_transfer_explicit` | regex `/(vou (passar|transferir)|outra pessoa (vai|irá) te (atender\|responder))/i` | REGEN | Handoff invisível é regra da marca |
| `never_price` | regex `/\b(R\$\|R \$\|reais?)\s*\d\|preço\s+é\|custa\s+R?\$/i` | REGEN | Estela nunca fala preço (regra absoluta) |
| `never_self_clarify` | regex `/(só pra (eu\|a gente) (entender\|confirmar\|saber)\|deixa eu (entender\|confirmar)\|pra (eu\|gente) (saber\|entender) direitinho)/i` | REGEN | **Cobre EXATAMENTE o bug original** ("Só pra eu entender direitinho a sua pergunta"). Auto-clarificação de pergunta inexistente. |
| `never_meta_question` | regex `/sua pergunta:?\s*[\wÀ-ÿ]\|você (quer\|está) (saber\|perguntando) se/i` | REGEN | Cobre meta-comunicação ("você quer saber se...") que apareceu no bug original como tentativa de salvar prompt mal-formado. |

Em todos os 6 casos: REGEN chama Persona novamente conforme protocolo na seção 6.4. Se segunda passagem TAMBÉM violar a mesma regra, escala (`decision: ESCALAR`, marca conversa como `needs_human`, dispara notificação interna).

### 6.4 Protocolo de REGEN

Quando validador retorna `REGEN`, o router:

1. Constrói **hint estruturado** (JSON, não texto livre):
   ```json
   {
     "rule_violated": "never_self_clarify",
     "failed_excerpt": "Só pra eu entender direitinho a sua pergunta",
     "instruction": "Reformule SEM tentar esclarecer perguntas — responda direto ao que foi pedido."
   }
   ```

2. Re-monta o prompt da Persona injetando bloco XML adicional **logo antes do `<turn>`**:
   ```xml
   <previous_attempt_failed>
     <rule>never_self_clarify</rule>
     <excerpt>Só pra eu entender direitinho a sua pergunta</excerpt>
     <instruction>Reformule SEM tentar esclarecer perguntas — responda direto ao que foi pedido.</instruction>
   </previous_attempt_failed>
   ```

3. Chama LLM com `temperature = 0.1` (forçado, ignora config), `max_tokens` original.

4. Roda validador minimal de novo na segunda resposta.

5. Se passa, publica. `attempt_number=2` no log.

6. Se viola **mesma regra**: `decision: ESCALAR`, conversa marca `needs_human=true`, dispara notificação interna ao responsável da org. Resposta ao lead vira mensagem de fallback configurada em `agent.fallback_message`.

7. Se viola **regra diferente**: também ESCALAR (não tenta 3ª passagem — cap rígido).

**Hard cap:** 1 retry. Sem exceção. Custo por turn em caso de REGEN: 2 LLM calls.

### 6.5 As 7 regras LLM que ficam desligadas

Documentadas como referência pra ativação futura via observabilidade:

- `zero_pitch_servico` (correct)
- `nunca_preco` block (já coberto por regex `never_price`)
- `handoff_invisivel` correct (já coberto por regex `never_transfer_explicit`)
- `zero_meta_linguagem` block (menciona IA/robô/sistema)
- `nao_inventar_dados` block (cita dado sem search_kb)
- `bc47b754-...` correct (fraseologia de coach)
- `echo_pergunta_social` correct
- `usar_nome_revelado` correct

Quando os logs (seção 7) mostrarem padrão concreto de falha que cai em uma dessas regras, religamos individualmente — mas como detector (REGEN/ESCALAR), não como editor.

### 6.6 Formatter intocado

`formatWhatsAppMessages` continua exatamente como está (heurístico, não-LLM, só divide mensagem). É separado do validador. Não muda.

## 7. Observabilidade: `ai_agent_turn_logs`

### 7.1 Schema da tabela

```sql
CREATE TABLE ai_agent_turn_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id         UUID NOT NULL REFERENCES ai_conversation_turns(id) ON DELETE CASCADE,
  agent_id        UUID NOT NULL REFERENCES ai_agents(id),
  org_id          UUID NOT NULL REFERENCES organizations(id) DEFAULT requesting_org_id(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id),

  attempt_number    INTEGER NOT NULL DEFAULT 1,    -- 1 = primeira passagem, 2 = REGEN
  prompt_system     TEXT,                          -- prompt completo com PII scrubbing aplicado
  prompt_user       TEXT,                          -- mensagem do lead com PII scrubbing
  raw_response      TEXT,                          -- resposta crua do LLM (antes do Formatter)
  final_messages    TEXT[],                        -- mensagens pós-Formatter (o que foi enviado ao WhatsApp). NULL se REGEN/ESCALAR.
  model_used        TEXT,
  temperature_used  NUMERIC(3,2),
  max_tokens_used   INTEGER,
  tool_calls        JSONB DEFAULT '[]'::jsonb,
  validator_verdict JSONB,                         -- { decision, red_lines_hit[], reason }
  slot_in_focus    TEXT,                          -- key do slot atual (passado explicitamente pelo prompt builder)
  duration_ms       INTEGER,
  prompt_builder_version TEXT,                     -- git commit hash curto do prompt_builder_v2.ts no momento do build
  discovery_config_hash  TEXT,                     -- SHA256 dos slots do moment atual (detect mudança de config entre turns)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_agent_turn_logs_turn ON ai_agent_turn_logs(turn_id);
CREATE INDEX idx_ai_agent_turn_logs_agent_created ON ai_agent_turn_logs(agent_id, created_at DESC);
CREATE INDEX idx_ai_agent_turn_logs_conversation ON ai_agent_turn_logs(conversation_id, created_at DESC);

ALTER TABLE ai_agent_turn_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_agent_turn_logs_org_select ON ai_agent_turn_logs FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY ai_agent_turn_logs_service_all ON ai_agent_turn_logs TO service_role
  USING (true) WITH CHECK (true);
```

### 7.2 Quando o router grava

Após CADA chamada da Persona Agent (primeira passagem E retry), o router faz INSERT na tabela:
- 1ª chamada → INSERT com `attempt_number=1`, `validator_verdict={decision: 'PUBLICAR'|'REGEN'|'ESCALAR', ...}`
- Retry (se houver) → INSERT com `attempt_number=2`, `validator_verdict={decision: 'PUBLICAR'|'ESCALAR', ...}`

`final_messages` é populado APENAS quando `decision = PUBLICAR` (mensagens efetivamente enviadas pós-Formatter). Em REGEN/ESCALAR vai NULL.

INSERT é fire-and-forget — falha no log NÃO bloqueia envio ao WhatsApp. Erros de INSERT vão pra Sentry.

### 7.3 `slot_in_focus` — como é decidido

O Persona Agent, ao montar o prompt, sabe qual slot está sendo explorado. O `BuildPromptV2Input` ganha um campo novo:

```typescript
interface BuildPromptV2Input {
  // ... campos existentes ...
  current_slot: DiscoverySlot | null;  // slot que o backend escolheu pra esse turn
}
```

O backend escolhe `current_slot` baseado em:
1. Lista de slots do `currentMoment.discovery_config.slots`
2. Filtra slots cujo `crm_field_key` JÁ está populado em `card.form_data` (silenciados)
3. Primeiro slot remanescente, em ordem de prioridade (critical > preferred > nice_to_have)

`current_slot.key` é salvo em `ai_agent_turn_logs.slot_in_focus`. Se nenhum slot é injetado (ex: turn de abertura sem discovery), fica `NULL`.

### 7.4 PII scrubbing antes de gravar

Antes do INSERT em `ai_agent_turn_logs`, `prompt_system` / `prompt_user` / `raw_response` passam por função `scrubPII(text: string): string`:

```typescript
function scrubPII(text: string): string {
  return text
    // telefones brasileiros
    .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/g, '[PHONE]')
    // emails
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    // CPF
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]');
}
```

Nomes próprios NÃO são scrubbed (são parte do contexto necessário pra auditoria de tom; performance de NER em texto pequeno seria custosa). Esse trade-off é consciente e documentado em release notes.

### 7.5 TTL automático

```sql
CREATE OR REPLACE FUNCTION cleanup_ai_agent_turn_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM ai_agent_turn_logs WHERE created_at < now() - interval '30 days';
END $$;

SELECT cron.schedule(
  'cleanup-ai-agent-turn-logs',
  '0 3 * * *',
  $$SELECT cleanup_ai_agent_turn_logs()$$
);
```

(Assumindo extensão `pg_cron` disponível — já em uso no Supabase produção.)

### 7.6 UI "Ver execução" na conversa

No componente que renderiza a tela de conversa de um card (`CardDetail` → `ConversationView` ou equivalente), cada mensagem da Estela ganha um ícone discreto (lupa pequena) ao lado do timestamp.

Click no ícone abre **side sheet** com:
- **Header:** "Execução turn `<id>` · `<model>` · `<duration_ms>ms` · validator: `<decision>`"
- **Tab 1 — Prompt enviado:** `prompt_system` + `prompt_user` em monospace, com toggle pra collapse de seções longas (header/voice/listening/playbook/turn) usando regex de busca pelos delimitadores XML.
- **Tab 2 — Resposta crua:** `raw_response` em monospace.
- **Tab 3 — Tools:** `tool_calls` formatado como lista de cards (tool_name, args, result).
- **Tab 4 — Veredito:** `validator_verdict.decision`, `red_lines_hit`, `reason`.

Acesso: usuários da org da conversa (RLS já garante). Não há controle adicional — qualquer admin que vê a conversa vê o log.

## 8. UI Pipeline Studio: discriminação por engine

### 8.1 Mudanças no componente

`src/components/ai-agent-v2/editor/playbook/moments/DiscoveryConfigEditor.tsx` recebe novo prop `engineVersion: 'v1' | 'v2'` via `MomentCard` (que já tem `agentId` e busca `agent.engine`).

Renderização:

- **Quando `engineVersion === 'v1'` (Estela, Luna):** mostra os 4 campos novos (`goal`, `must_include`, `example_questions`, `literal_question`) + campo `reject_if` (mantido como avançado). Campos `questions`, `must_collect`, `coverage_notes` ficam ESCONDIDOS — não editáveis na UI nova. (Os dados deprecated continuam no banco, só não aparecem.)
- **Quando `engineVersion === 'v2'` (Patricia):** UI atual sem mudança. Mostra os campos legados (`questions`, `must_collect`, `coverage_notes`, `reject_if`). Esconde os 4 novos.

### 8.2 Componente do schema novo (sketch)

```tsx
// Quando engineVersion === 'v1'

<SlotItem>
  <Input label="Ícone" />
  <Input label="Nome do item" />
  <RadioGroup label="Prioridade" options={['critical','preferred','nice_to_have']} />
  <CrmFieldPicker label="Campo do CRM" />

  <Textarea
    label="Objetivo"
    required
    placeholder="O que você quer descobrir nesse item da sondagem?"
    help="Texto livre. A Estela usa pra entender o que precisa cobrir."
  />

  <TagsInput
    label="Elementos obrigatórios"
    placeholder="Ex: mês, ano"
    help="Itens atômicos que a pergunta DEVE cobrir. Não escreva frases descritivas — só palavras-chave."
  />

  <RepeatableInput
    label="Exemplos de pergunta"
    maxItems={3}
    help="1 a 3 exemplos de TOM. A Estela NÃO copia literal, usa como referência."
  />

  <Input
    label="Pergunta literal (override)"
    help="Se preenchida, a Estela usa exatamente essa pergunta. Use só quando precisar ser cirúrgico."
  />

  <Collapse title="Rejeitar respostas vagas (avançado)">
    <RejectIfList />
  </Collapse>
</SlotItem>
```

### 8.3 Validação client-side (rigorosa — bloqueia salvamento)

- `goal` (obrigatório):
  - mínimo 10 caracteres
  - máximo 300 caracteres (hard cap)
  - **REJEITA se termina com `?`** — mensagem: "Goal é objetivo, não pergunta. Escreva 'Descobrir se...' ou 'Saber qual...'"
- `must_include`:
  - **REJEITA strings que contêm preposição+artigo seguida de verbo** (regex `/\b(de|em|para|com|por|a|o|dos|das)\s+\w+\s+(se|vai|tem|tá|está)\b/i`). Mensagem: "Use conceitos atômicos (1-3 palavras): 'mês', 'ano', 'número de convidados'. Você escreveu uma descrição — passe pra `example_questions` ou `goal`."
  - máximo 4 palavras por item
- `example_questions`:
  - máximo 3 itens
  - cada item até 200 chars
- `literal_question`:
  - quando preenchido, desabilita `must_include` e `example_questions` visualmente (cinza com tooltip "literal_question override está ativo")

### 8.4 Preview "antes vs depois" no Pipeline Studio

Ao editar um slot, painel lateral mostra:

- **Tab "Antes":** O bloco que seria injetado no prompt da Estela **com a config ATUAL** (lê do banco).
- **Tab "Depois":** O bloco que será injetado **com a config sendo editada** (lê do form).
- **Tab "Diff":** Diff lado-a-lado destacando o que muda.

Render do bloco usa a mesma função `renderSlotForPrompt(slot)` do backend (compartilhada via TypeScript). Garante paridade.

Isso permite Vitor (não-técnico) ver "ah, com esse goal a pergunta no prompt fica assim" antes de salvar.

### 8.5 SDR-qualification UI em andamento (untracked)

Os arquivos novos em `src/components/sdr-qualification/` e `src/hooks/useSdrQualification.ts` / `useEstelaScoringRules.ts` são read-only consumers das scoring rules — não tocam em `discovery_config`. Esse spec NÃO altera o trabalho dessa task paralela.

## 9. Plano de subida

1. **Backup automático da discovery_config atual:** snapshot completo da Estela antes de qualquer mudança.
   ```sql
   CREATE TABLE ai_agent_moments_backup_20260512 AS
     SELECT * FROM ai_agent_moments
     WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';
   ```
   Migration de rollback é trivial: `UPDATE ai_agent_moments ... FROM backup`.

2. **Feature flag de rollback runtime:** adicionar coluna `feature_flag_discovery_v2 BOOLEAN DEFAULT FALSE` em `ai_agents`. Flag liga/desliga schema novo SEM redeploy.
   - Quando `FALSE`: backend ignora `goal`, lê schema antigo (`questions`/`must_collect`/etc).
   - Quando `TRUE`: backend prefere schema novo.
   - Liga só pra Estela após migration de dados validada por Vitor.

3. **Migration banco — schema:** adicionar campos opcionais ao `discovery_config.slots[]` (aditivo, sem CHECK constraint nova) + coluna `feature_flag_discovery_v2`.

4. **Migration banco — tabela logs:** criar `ai_agent_turn_logs` + RLS + cron de TTL.

5. **Migration banco — dados:** popular `goal`/`example_questions` nos 6 slots da Sondagem da Estela (sem tocar nos campos antigos).

6. **Backend — prompt_builder_v2.ts:** adicionar `renderSlotForPrompt()` com nova hierarquia. Atualizar `renderOneMoment()` pra preferir caminho novo quando `agent.feature_flag_discovery_v2 === true` E `goal` preenchido. Manter `deriveSlotQuestion` no mesmo arquivo como fallback.

7. **Backend — `current_slot`:** estender `BuildPromptV2Input` com campo `current_slot`. Backend escolhe slot conforme seção 7.3. Persistir em `slot_in_focus` do log.

8. **Backend — index.ts (router):** substituir `runValidator` por `runValidatorMinimal`. Adicionar `runValidatorMinimal()` em novo arquivo `validator_minimal.ts` com as 6 regras + protocolo REGEN (`<previous_attempt_failed>` XML).

9. **Backend — logging:** após cada chamada Persona (primeira + retry), chamar `recordTurnLog(supabase, payload)` em `turn_logger.ts`. Incluir PII scrub, prompt_builder_version (commit hash via build-time env var), discovery_config_hash.

10. **Frontend — função compartilhada:** extrair `renderSlotForPrompt()` em módulo TypeScript usado tanto pelo backend (Deno) quanto pelo frontend (Vite) — preview "antes vs depois" precisa de paridade exata. Pode ser `shared/slot_renderer.ts` se houver pasta shared, ou duplicação consciente com teste de paridade.

11. **Frontend — UI editor de slot:** estender `DiscoveryConfigEditor` com discriminação por `engineVersion` + validação rigorosa (seção 8.3) + preview "antes vs depois" (seção 8.4).

12. **Frontend — UI "Ver execução":** botão na mensagem da Estela, side sheet com 4 tabs, hook `useTurnLog(turn_id)`.

13. **Aplicar staging:** migrations + deploy edge function + Vercel preview. `feature_flag_discovery_v2` ainda FALSE pra Estela.

14. **Revisão admin staging:** Vitor edita os 6 slots no Pipeline Studio staging, valida `goal`/`example_questions` cada um usando preview "antes vs depois". Depois MARCA `feature_flag_discovery_v2 = TRUE` pra Estela em staging.

15. **Teste E2E staging:** conversa de teste com phone 11964293533 (whitelist). Verifica que (a) sondagem flui natural, (b) bug original ("Em fevereiro de 2028") NÃO causa auto-clarificação, (c) logs gravam, (d) "Ver execução" renderiza, (e) validador minimal pega "Só pra eu entender" se forçado.

16. **Promote produção** seguindo protocolo de migrations do `CLAUDE.md`. Flag continua FALSE em prod inicialmente.

17. **Smoke test em produção** (`feature_flag_discovery_v2 = FALSE`): garantir que nada quebrou no caminho legado.

18. **Cutover:** ligar `feature_flag_discovery_v2 = TRUE` pra Estela em produção. Se algo der errado, `UPDATE ai_agents SET feature_flag_discovery_v2 = FALSE WHERE id = ESTELA` reverte sem redeploy.

19. **Auditoria pós-deploy:** 24h depois, query em `ai_agent_turn_logs` filtrando por (a) `validator_verdict->>'decision' = 'REGEN'` com agrupamento por regra, (b) padrões textuais do bug original (`raw_response ILIKE '%sua pergunta%'`, `'%para casar fora%'`, `'%Welcome saber%'`, `'%só pra eu entender%'`). Ausência = fix validado.

## 10. Riscos e mitigações

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | Migração de dados popula `goal` errado pra algum slot | média | Vitor revisa cada slot na UI staging com preview "antes vs depois". `feature_flag_discovery_v2` permite rollback sem redeploy. |
| R2 | Hierarquia injeta texto duplicado quando `must_include` E `example_questions` ambos preenchidos | baixa | Hierarquia explícita (seção 4): `must_include` é primário com instrução de coleta exata; `example_questions` é referência de tom adicional. Testes pré-deploy verificam render. |
| R3 | Validador minimal regen-a turn legítimo (false positive nos 6 patterns) | baixa | Patterns são bem definidos. Logs gravam todo veredito (mesmo PUBLICAR) — falso-positivo aparece em audit. |
| R4 | Loop infinito de REGEN | crítica | Hard cap de 1 retry. Segundo regen ESCALA com fallback_message. |
| R5 | Bug original ("sua pergunta...") passa pelo validador minimal | crítica | Mitigado por 2 regras dedicadas: `never_self_clarify` + `never_meta_question`. Teste E2E (passo 15) força exatamente esse cenário. |
| R6 | Mudança em `prompt_builder_v2.ts` afeta Luna (V1) se reativada | alta | Caminho legado preservado (`feature_flag_discovery_v2=FALSE` cai no `deriveSlotQuestion`). Antes de reativar Luna, smoke test obrigatório. |
| R7 | UI nova confunde Vitor (curva de aprendizado) | baixa | Help text inline + preview "antes vs depois". Migration popula valores razoáveis pra todos os 6 slots — Vitor pode subir sem editar. |
| R8 | `ai_agent_turn_logs` infla banco | média | TTL 30 dias automático. 100 turns/dia × 30KB × 30 dias = ~90MB — sustentável. PII scrubbing reduz risco de exposição. |
| R9 | RLS de `ai_agent_turn_logs` quebra leitura | média | Policy `USING (org_id = requesting_org_id())` segue padrão por-org já validado. Smoke test confirma SELECT depois do deploy. |
| R10 | UI "Ver execução" expõe dados pessoais | baixa | PII scrubbing aplicado pre-INSERT (telefone, email, CPF). Nomes próprios NÃO scrubbed (trade-off consciente). RLS restringe leitura por org. |
| R11 | Cron `pg_cron` indisponível em staging | baixa | Cleanup pode rodar manualmente se cron indisponível. |
| R12 | Hint do REGEN (XML `<previous_attempt_failed>`) vira novo vetor de prompt injection | média | Hint é estruturado (não texto livre do lead). Conteúdo controlado pelo backend (regra violada conhecida). Temperature reduzida pra 0.1 na 2ª passagem. |
| R13 | `prompt_builder_version` quebra se build não passar commit hash | baixa | Build script injeta `VITE_BUILD_COMMIT`/`SUPABASE_FUNCTION_BUILD_COMMIT` via env. Se vazio, salva "unknown" — não bloqueia, só perde rastreabilidade. |
| R14 | Patricia ou Luna acidentalmente recebem `feature_flag_discovery_v2 = TRUE` | alta | Flag default FALSE. Migration explícita liga APENAS pra Estela ID `43180319-650c-490a-87be-f275550285f8`. Validar em pre-deploy. |
| R15 | Painel "Ver execução" expõe prompt cru (sensível ao admin) | baixa | Acesso já restrito por RLS da conversa (org-level). PII scrubbing aplicado. Não é segredo da OpenAI — é prompt que o admin construiu. |

## 11. Verificação end-to-end

### 11.1 Testes determinísticos

- `npm run build` — typecheck passa
- Lint passa (já bloqueia commit hoje)
- Smoke test schema `bash .claude/hooks/schema-smoke-test.sh` continua passando

### 11.2 Testes manuais em staging

1. **Sondagem natural:** Vitor manda mensagem inicial pelo phone whitelist. Estela responde abertura. Vitor responde com data ("Em fevereiro de 2028"). Estela deve responder reconhecendo a data + UMA pergunta sobre OUTRO critério (destino/convidados/investimento) — não a auto-clarificação de viagem internacional.
2. **Cobertura completa:** Vitor responde data, destino, convidados, investimento, ajuda-família, viagem internacional. Confirma que cada slot é coberto sem alucinação.
3. **Validador regen — caso "vou passar":** força Estela a tentar handoff explícito (via prompt manipulation se preciso). Logs mostram `decision: REGEN` e segunda passagem corrige.
4. **Validador regen — caso "preço":** semelhante, força menção de valor. Logs mostram REGEN.
5. **UI "Ver execução":** abre painel na mensagem alucinada antiga (turn `73167143-...`) e na nova conversa. Confirma que tabs renderizam prompt, raw response, tools, veredito.

### 11.3 Critério de sucesso

- ✅ Conversa nova da Estela na Sondagem flui sem alucinação estrutural
- ✅ `ai_agent_turn_logs` tem ≥1 linha por turn da Estela; `attempt_number=2` aparece em casos REGEN
- ✅ `slot_in_focus` populado em todo turn que injeta slot
- ✅ `prompt_builder_version` populado com commit hash em todo turn
- ✅ PII scrubbing aplicado (regex de PHONE/EMAIL/CPF no prompt salvo, não nos dados de runtime)
- ✅ UI "Ver execução" abre e mostra dados completos (4 tabs)
- ✅ Pipeline Studio para Estela mostra os 4 campos novos + preview antes/depois
- ✅ Pipeline Studio para Patricia continua mostrando os campos antigos (UI antiga inalterada)
- ✅ Validador minimal regen-a o caso "vou passar", "R$", "Só pra eu entender" e "sua pergunta:" e publica segunda passagem corrigida — OU escala consistentemente após 2ª falha
- ✅ Query de auditoria 24h pós-deploy retorna 0 linhas pros padrões textuais do bug original
- ✅ `feature_flag_discovery_v2 = FALSE` produz fallback funcional (testa rollback runtime sem redeploy)
- ✅ Loop infinito de REGEN é impossível (cap rígido de 1 retry validado em teste E2E)

## 12. Follow-ups (fora desse spec, registrados pra iterações futuras)

Achados de auditoria que NÃO entraram nesse pacote, mas valem revisitar:

1. **Question-Composer Agent (Phase 2 da arquitetura):** mover geração de pergunta pra LLM dedicada que recebe `goal` + estado da conversa e gera a pergunta perfeita em runtime. Tira completamente a dependência de admin escrever certo. Custo: 1 LLM call adicional por slot. Spec separado, pós-validação dos resultados desse spec.
2. **A/B testing dual-route:** rodar Estela 50% schema novo + 50% schema antigo em paralelo, medir REGEN rate e qualidade. Permite decisão data-driven sobre o redesign vs gut feel.
3. **Backoffice + Data Agent sanitizers:** validar que `ai_resumo`/`ai_contexto` (gerados pelo Backoffice) e `qualificationSignals` (gerados pelo Data Agent) não contaminam a Persona com inferências falsas. O Bug original pode ter componente pré-Persona não auditado nesse spec.
4. **UI logs: search + diff + turn picker:** debug de bug raro fica difícil com side sheet linear. Iteração da UI quando tiver casos reais de uso.
5. **Eval scoring na UI "Ver execução":** botão "👍/👎" em cada turn pra coletar feedback humano. Vira training data pra fine-tune futuro.
6. **Cleanup dos campos deprecated:** após 60-90 dias sem fallback acionado, DROP de `must_collect`/`questions`/`coverage_notes` dos slots da Estela. Patricia/Luna mantêm.
7. **Religar regras LLM caso a caso:** quando logs mostrarem padrão concreto de violação que regex não pega, religar via LLM como DETECTOR (não editor).
8. **Métricas dashboard:** pg_cron agregando `ai_agent_turn_logs` em tabela `ai_agent_metrics` (regen_rate hourly, duration_ms p95, slot_in_focus distribution). Permite alertas Sentry quando regen_rate > X.
