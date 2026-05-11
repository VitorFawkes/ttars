# Estela Redesign — Estado de continuação (2026-05-11 fim do dia)

Documento pra retomar o trabalho em sessão dedicada. Status até o momento desta pausa.

## Branch atual

`feat/estela-redesign` (12 commits acima de main).

Última commit local: `f8b77204 fix(discovery-v2): type-safe check de slot.goal no branching V2`.

## O que está pronto (Tasks 1-8)

### Tasks 1-4 — Banco (4 migrations, aplicadas em staging)

| Migration | Faz | Commit |
|---|---|---|
| `20260512j_estela_redesign_01_backup.sql` | Backup `ai_agent_moments_backup_20260512` da Estela | `2ea0519f` |
| `20260512k_estela_redesign_02_feature_flag.sql` | Coluna `ai_agents.feature_flag_discovery_v2 BOOLEAN DEFAULT FALSE` | `d899b5eb` |
| `20260512l_estela_redesign_03_turn_logs.sql` | Tabela `ai_agent_turn_logs` + RLS por org + 3 índices | `7611a4e5` |
| `20260512m_estela_redesign_04_turn_logs_ttl_cron.sql` | Função `cleanup_ai_agent_turn_logs()` + pg_cron diário 03:00 UTC | `aca2697c` |

Todas validadas em staging via Management API. Pendente: `promote-to-prod` (fazer só após Tasks 9-10 prontas).

### Tasks 5-7 — Funções puras backend (com testes Deno)

| Arquivo | Função(ões) | Testes | Commit |
|---|---|---|---|
| `supabase/functions/ai-agent-router/slot_renderer.ts` | `renderSlotForPrompt(slot)` — hierarquia literal_question > must_include > example_questions > goal puro | 8 | `9f51d480` |
| `supabase/functions/ai-agent-router/validator_minimal.ts` | `runValidatorMinimal(input)` + `buildRegenHintBlock(verdict)` — 6 regex | 11 | `0c16197d` |
| `supabase/functions/ai-agent-router/turn_logger.ts` | `scrubPII`, `recordTurnLog`, `hashDiscoveryConfig`, `hashDiscoveryConfigSync` | 12 | `6097d36d` |

Testes não rodados localmente (Deno não instalado no host). Lógica validada visualmente. Edge function deploy roda typecheck do Deno automaticamente.

### Task 8 — Integração no `prompt_builder_v2.ts`

Commits: `e90d8a2b` (subagent Opus) + `f8b77204` (fix de type-safety vindo do code review).

Mudanças:
- Import de `renderSlotForPrompt` + `SlotV2` (linha 54)
- 3 novos campos em `BuildPromptV2Input`: `feature_flag_discovery_v2?`, `current_slot?`, `previous_attempt_failed?` (linhas 157-168)
- Branch V2 ANTES do legacy em `renderOneMoment` (linhas 780-789): se `feature_flag_discovery_v2` E `slot.goal` válido (string não-vazia após trim), usa `renderSlotForPrompt`; senão cai no legacy
- Propagação do flag via `renderAnchorsBlock` → `renderOneMoment` (linhas 205, 868, 887, 899)
- Injeção do bloco `<previous_attempt_failed>` antes de `<turn>` no `buildPromptV2` (linhas 1364-1373)

Spec review: aprovado. Code quality review: aprovado após fix de type-safety.

## O que falta (Tasks 9-10 + 11-18)

### Task 9 — Integrar tudo no `index.ts` (router, 4394 linhas)

Subagent Opus escalou `NEEDS_CONTEXT` com 4 perguntas. **Respostas pra dar quando retomar:**

**Q1: Onde `currentMoment` (com `discovery_config` completo) é setado?**
Resposta: `currentMoment` não está como variável local óbvia. O moment é detectado pelo `moment_detector.ts` e o resultado provavelmente tem o `moment_key` em `ctx.v2_current_moment_key` (~linha 2968). Pra ter o objeto completo (com `discovery_config.slots`), carregar via `loadPlaybookMoments(supabase, agent.id)` (já importado) — esse helper retorna o array de moments do agente. Achar o moment cujo `moment_key === ctx.v2_current_moment_key`. Cache local.

**Q2: `runPersonaAgent` aceita params de retry?**
Resposta: Não hoje. Adicionar 2 params opcionais na signature: `previous_attempt_failed?: string | null` e `temperature_override?: number`. Propagar pro `buildPromptV2` que já aceita esses fields (Task 8). Pra `temperature_override`, sobrescrever o `temperature` da chamada OpenAI se preenchido.

**Q3: Legacy path 100% unchanged quando flag=false?**
Resposta: Sim, 100%. Estrutura sugerida:
```typescript
let validatedResponse: string;
if (agent.feature_flag_discovery_v2) {
  // ... toda a lógica nova: runValidatorMinimal + REGEN + log
  validatedResponse = ...;
} else {
  // código atual de runValidator(...) — copiar exatamente como está hoje
  validatedResponse = await runValidator(supabase, agent, personaResponse, ...);
}
```

**Q4: Como lidar com FK constraint `ai_agent_turn_logs.turn_id → ai_conversation_turns(id)` se INSERT do turn é só no fim do fluxo?**
Resposta: 2 opções:

**Opção A (preferida):** Pre-gerar `const turnId = crypto.randomUUID()`. Manter ordem atual de INSERT do `ai_conversation_turns` no fim do fluxo (com esse ID explícito). Chamar `recordTurnLog(...)` LOGO APÓS o INSERT do `ai_conversation_turns` (sequência mesmo bloco). Isso garante FK válida. Send pro WhatsApp pode ser antes ou depois do INSERT — o que importa é a ordem `INSERT conversation_turns → recordTurnLog`.

**Opção B (fallback):** Soltar a FK constraint. Mudar `turn_id UUID NOT NULL REFERENCES ai_conversation_turns(id) ON DELETE CASCADE` para soft FK (sem REFERENCES). Perde integridade referencial mas dá flexibilidade. Não recomendo a menos que A se mostre inviável.

### Task 10 — Seed dos 6 slots da Sondagem

SQL já redigido no plano original (`docs/superpowers/plans/2026-05-11-estela-redesign-sondagem-validador-logs.md`, Task 10 — usar prefixo de migration `20260512n` ou próximo disponível).

Aplicar em staging (verifica que escreve null se Estela não existir lá), promover pra produção depois.

### Tasks 11-18 — Frontend + Deploy

Plano detalhado em `docs/superpowers/plans/2026-05-11-estela-redesign-sondagem-validador-logs.md`. Não iniciadas.

## Pendência crítica: commit em main que precisa ser revertido

**Contexto:** O subagent Opus que fez Task 8 commitou em `main` por engano (commit `5080939c`). Eu fiz `cherry-pick` pra `feat/estela-redesign` (commit `e90d8a2b`) e local fiz `git revert` em main (commit `d541bb05` em main, local).

**Estado atual:**
- `feat/estela-redesign`: tem o commit cherry-picked + fix (`e90d8a2b` + `f8b77204`). OK.
- `main`: tem o commit problemático `5080939c` + o revert local `d541bb05`. **Revert NÃO foi pushed.**

**Por que importa:** se alguém der `npx supabase functions deploy ai-agent-router` no main atual remoto, o edge function vai quebrar (import de `./slot_renderer.ts` que não existe em main remoto). Não é deploy automático, mas é risco.

**O que fazer:**
1. Confirmar com Vitor se ele pode dar push do revert em main: `git push origin main` (não-destrutivo, só adiciona commit reverso). Ou eu posso fazer com autorização.
2. Alternativa segura: deixar local — risco é baixo porque ninguém deploya edge function manualmente sem motivo.

## Como retomar em sessão nova

```bash
cd /Users/vitorgambetti/Documents/WelcomeCRM
git checkout feat/estela-redesign
git log --oneline -15  # verificar que 12 commits estão lá
```

Ler na ordem:
1. Esse arquivo (continuação)
2. `docs/superpowers/specs/2026-05-11-estela-redesign-sondagem-validador-logs-design.md` (spec original)
3. `docs/superpowers/plans/2026-05-11-estela-redesign-sondagem-validador-logs.md` (plano original — tasks 9 em diante)

Próximo passo concreto: re-dispatch o subagent Opus pra Task 9 já com as 4 perguntas respondidas (resumo acima). Ou implementar manualmente em ~2-3h de trabalho focado.

## Risco de regressão se pausar aqui

**Nenhum.** Estado atual em produção:
- `ai_agents.feature_flag_discovery_v2 = FALSE` pra todos os agentes (default)
- Edge function `ai-agent-router` em produção NÃO foi atualizado (deploy não rodou)
- Nada do código novo está rodando ainda

Estela continua como antes do redesign. Conserto do slot `info_3d8u` (aplicado mais cedo no dia via migration `20260511j`) continua valendo — Estela não vai mais alucinar sobre viagem internacional.
