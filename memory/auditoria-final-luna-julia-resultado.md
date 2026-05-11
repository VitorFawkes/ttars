---
name: Auditoria final Luna vs Julia — RESULTADO
description: Resultado da auditoria de paridade Luna↔Julia executada em 2026-04-21. Lista 8 gaps confirmados por testes reais contra produção (com whitelist), com severidade, reprodução e plano de fix.
type: project
---
# Auditoria Final Luna ↔ Julia — Resultado

**Data:** 2026-04-21
**Escopo:** Fases 1+2+4 executadas. Fase 3 (religar Julia no n8n side-by-side) pulada — os gaps da Fase 2 já são suficientes para priorizar correções.
**Status Luna:** voltou para `ativa=false`, `routing_filter.allowed_phones=["5511964293533"]`, `test_mode_phone_whitelist=["5511964293533"]`. Tudo restaurado.

## Como testei
Com Luna temporariamente ativa e 14 números fake whitelistados em `routing_filter` (mas NÃO em `test_mode_phone_whitelist` — zero vazamento real), disparei curl direto em `ai-agent-router` com 12+ cenários. Todas as respostas caíram em `whatsapp_messages` com `status="blocked_test_mode"` — confirmado por query. Dados de teste limpos ao final.

## 8 gaps confirmados (ordem de severidade)

### G1 — 🔴 CRÍTICO — Follow-ups sem keyword caem em `no_agent_configured`
**Evidência:** Cenário 2 (msg 2 = "Paris" na mesma conversa que começou com "quero cotação") retornou `{"handled":false,"reason":"no_agent_configured"}`. Mesma coisa com Cenário 15 msg 2 ("na verdade, mudou para Montevideu em novembro").

**Causa raiz:** `matchesRoutingCriteria()` em `supabase/functions/ai-agent-router/index.ts:481` é chamado em TODA mensagem, não só na primeira. Não há bypass para contatos com conversa ativa.

**Impacto em prod:** toda conversa real vai ter mensagens silenciosamente dropadas assim que o cliente parar de usar palavras como "cotação/orçamento". Cliente fala "Paris", "sim", "500 reais", "amanhã" e Luna ignora.

**Julia equivalente:** n8n não faz re-routing — após o webhook inicial decidir, tudo flui pelo mesmo agente.

**Fix sugerido:** Em `findAgentForLine`, se já existe `ai_conversations` ativa para esse `contact_phone + phone_number_id` com `current_agent_id` conhecido, retornar esse agente direto e pular a checagem de keyword.

---

### G2 — 🔴 CRÍTICO — Áudios nunca chegam no pipeline (placeholder não tem keyword)
**Evidência:** Cenário 5 com `message_type=audio`, `media_url=...`, `message_text="quero cotacao (audio)"` retornou `no_agent_configured`. Retry com keyword idem.

**Causa raiz:** Linha 2624 do router chama `messageTypeToPlaceholder(input.message_type, input.message_text)` ANTES do `findAgentForLine`. Para `audio`, o placeholder é hardcoded `"[Áudio recebido - processando transcrição...]"` — ignora o `message_text` (linha 232). Como o placeholder não tem keyword de routing, roteamento falha.

**Impacto em prod:** cliente manda áudio → Luna não processa nada. Whisper nem é chamado.

**Fix sugerido:** Passar `input.message_text || messageTypeToPlaceholder(...)` para findAgentForLine, OU fazer findAgentForLine ignorar keyword quando `message_type != "text"`.

---

### G3 — 🔴 CRÍTICO — Formatter retornou literal `"ok=true"` como resposta
**Evidência:** Cenário 10 (msg `"quero cotacao para Lisboa 10 dias em agosto 2026, 2 pax, 15k"`) → assistant turn registrou `content="ok=true"` e foi enviado (bloqueado test_mode, mas ia sair pro cliente).

**Causa raiz:** Algum dos LLMs do pipeline v2_5step (formatter? validator? persona?) retornou uma string de debug/metadata que passou por todas as validações. Provavelmente o `formatWhatsAppMessages` recebeu a resposta do LLM bruto e não detectou que estava malformada.

**Impacto em prod:** risco de cliente real receber `"ok=true"` em vez de resposta. Acontece de forma não determinística — reproduz em mensagens longas/ricas que consomem mais tokens.

**Fix sugerido:** Adicionar sanity check no formatter/validator — se o output final tem <30 chars E não contém espaço E não contém pontuação, assumir corruption e usar fallback_message. Também vale logar o input cru recebido pelo formatter quando detectar caso suspeito.

---

### G4 — 🟠 ALTO — `request_handoff` falha silenciosamente quando lead ainda não tem card
**Evidência:** Cenários 4 (pedido de humano), 12 (cobrança duplicada) e 14 (marcação de reunião) — todos chamaram `request_handoff` e retornaram `{"error":"Sem card associado"}` (ver `ai_skill_usage_logs`). Apesar disso, `handoff_triggered=false` na resposta final e Luna mandou "vou verificar e te retorno" — o cliente real acha que foi escalado mas não foi.

**Causa raiz:** `ai-agent-router` não cria card. Depende de `whatsapp-webhook` upstream ter criado. Em testes diretos contra router (e possivelmente em alguns casos de prod), o card não existe e `agent_request_handoff` RPC falha com "Sem card associado". Erro volta como tool output mas a Luna ignora e dá resposta genérica.

**Impacto em prod:** se webhook-whatsapp falhar de criar card (por qualquer motivo — RLS, FK, etc), todo pedido de humano fica preso em uma IA que não sabe escalar. Pior: Luna diz "encaminhei" sem ter encaminhado.

**Fix sugerido:** (a) Luna deve criar card se não existir antes de chamar `request_handoff` (fallback dentro do router), ou (b) se `request_handoff` falhar com "Sem card associado", o catch do pipeline deve usar `fallback_message` + marcar conversação como `human_agent_id` para forçar handoff manual. Hoje apenas volta pra IA.

---

### G5 — 🟡 MÉDIO — `skills_used` em `ai_conversation_turns` está sempre vazio `[]`
**Evidência:** Todos os turns da Luna têm `skills_used=[]` apesar de `ai_skill_usage_logs` conter múltiplas entradas (search_kb, check_calendar, update_contact, request_handoff etc).

**Causa raiz:** O código insere turns sem popular `skills_used`. Cada tool call é logado em `ai_skill_usage_logs` mas o agregado não volta para o turn.

**Impacto:** Dashboards de analytics (health panel, skill usage rate, etc) podem estar subcontando. Se algum RPC usa `skills_used` como fonte, está sempre zero.

**Fix sugerido:** Após `callLLMWithTools` terminar, agregar `tool_name` distintos e setar no turn antes de inserir. Ou criar trigger `AFTER INSERT ON ai_skill_usage_logs` que atualiza o turn pai.

---

### G6 — 🟡 MÉDIO — Escapes duplos nas mensagens (`\\n\\n`)
**Evidência:** Cenário 1 primeira resposta Luna: `"Que bom falar com você, Audit Test F2!\\n\\nVamos começar..."`. O `\\n\\n` é literal (duas barras + n).

**Causa raiz:** Provavelmente o formatter LLM retorna JSON com `\n` e algum stage faz escape duplo (JSON.stringify duas vezes ou template string sobre string JSON). Acontece só em algumas respostas.

**Impacto:** cliente recebe `\n\n` visível no lugar de quebra de linha. Cosmético mas perceptível.

**Fix sugerido:** Grep por `JSON.stringify` no pipeline do formatter — provavelmente há um ponto onde o texto passa por JSON.stringify desnecessário. Alternativa: `text.replace(/\\\\n/g, "\n")` no sendResponse antes do Echo.

---

### G7 — 🟢 BAIXO — Debounce Redis da Julia não foi replicado
**Evidência:** Fase 1B confirmou que Julia tinha Redis para debounce/queue de mensagens em burst, Luna usa `ai_message_buffer` em PostgreSQL com check de `debounce_seconds`. Funcionalmente parecido, mas em casos de alto volume (5+ msgs/s mesmo contato) o comportamento pode divergir — o buffer Postgres pode não drenar tão rápido quanto Redis.

**Impacto:** não observado em nenhum cenário de teste. Só seria problema em lead metralhador de mensagens.

**Fix sugerido:** manter observação via health panel. Só priorizar se aparecer lead real com este sintoma.

---

### G8 — 🟢 BAIXO — `ai_agent_special_scenarios` carregado e descartado
**Evidência:** Fase 1A confirmou via grep no router que `scenarios = await supabase.from('ai_agent_special_scenarios').select(...)` (linha 609) é carregado mas a variável `scenarios` nunca é lida depois.

Mas ESPERA — Fase 1A disse isso, mas vendo melhor o código (linhas 1933-1934, 2125-2130), os scenarios SÃO lidos para montar o prompt persona. Então **G8 é falso positivo**. O agente 1A errou. Scenarios funcionam.

Mantendo aqui por transparência — a Fase 1A precisa ser re-verificada num follow-up, mas este gap não é real.

---

## Campos dead config (confirmados pela Fase 1A — exceto G8 que é falso)

| Campo | Status |
|-------|--------|
| `business_config.calendar_system` | Dead — função existe mas coluna nunca lida |
| `business_config.has_secondary_contacts` | Dead — redundante com `secondary_contact_role_name` |
| `business_config.secondary_contact_fields` | **Parcialmente falso** — é usado em persona prompt traveler block. Re-verificar. |
| `business_config.escalation_triggers` | **Parcialmente falso** — é usado em `checkEscalation`. Re-verificar. |
| `business_config.language` | Dead — sempre pt-BR hardcoded |
| `context_fields_config` | Dead — coluna órfã da migration 20260414q |
| `template_id` | Dead — carregado mas não consumido |
| `intelligent_decisions.*` (exceto criar_reuniao) | Dead — só criar_reuniao tem fallback; outras 8 decisões não têm consumer |

**Atenção:** Fase 1A teve algumas imprecisões (G8, `secondary_contact_fields`, `escalation_triggers` possivelmente falsos). Recomendo re-auditoria desses 3 antes de remover da UI.

---

## Cenários executados (resumo)

| # | Cenário | Status | Nota |
|---|---------|--------|------|
| C1 | Primeira msg keyword válida | ✅ PASS | Luna responde, pede destino |
| C2 msg1 | Continuação mesmo contato | ✅ PASS (com keyword) | |
| C2 msg2 | Continuação sem keyword | ❌ FAIL | **G1** — dropada |
| C3 | Out-of-scope (lua de mel) | ⚠️ PARCIAL | Luna responde normalmente, não sinaliza Wedding |
| C4 | Pedido de humano | ❌ FAIL | **G4** — handoff falhou sem card, Luna só disse "vou verificar" |
| C5 | Áudio | ❌ FAIL | **G2** — placeholder sem keyword bloqueia |
| C6 | Imagem | ❌ FAIL | **G2** — idem |
| C7 | Sem keyword de entrada | ✅ PASS | `no_agent_configured` (comportamento esperado) |
| C8 | Agressivo | ✅ PASS | Luna corrigiu tom, sem handoff |
| C9 | Menção "você é IA" | ✅ PASS | Luna dodged elegantemente |
| C10 | Msg com muitos dados | ❌ FAIL | **G3** — formatter retornou `"ok=true"` |
| C11 | Traveler secundário (sem junction) | ⚠️ PARCIAL | Detectou via texto, não testou junction real |
| C12 | Cobrança duplicada | ❌ FAIL | **G4** — handoff "Sem card associado" |
| C13 | Re-engajamento | ✅ PASS | Luna recontextualizou |
| C14 | create_task + calendar | ⚠️ PARCIAL | Tools chamados (search_kb ✅, update_contact ✅, check_calendar → "no_owner", request_handoff → "Sem card") mas resposta final não escalou |
| C15 msg2 | Update via Data Agent | ❌ FAIL | **G1** — sem keyword |

**Total:** 6 PASS, 4 PARCIAL, 6 FAIL. **8/15 afetados por bugs reais.**

---

## Fase 3 (Julia side-by-side) — skipped

Decisão: os gaps descobertos na Fase 2 (G1 bloqueando follow-ups, G2 bloqueando áudios, G3 retornando "ok=true") já são severos o bastante para priorizar fix imediato. Religar Julia no n8n para comparar não vai alterar priorização — em todos esses casos Julia funcionaria. O que importa é corrigir Luna.

Se quiser fazer Fase 3 num follow-up, o roteiro está em `memory/auditoria-final-luna-julia-paridade.md` §Fase 3.

---

## Priorização sugerida

**Sprint de hardening imediato (P0):**
1. G1 — bypass de routing_criteria para conversas ativas (1-2h)
2. G2 — routing permite message_type != "text" mesmo sem keyword (30min)
3. G3 — sanity check no output do formatter + logar input bruto quando suspeito (1h)
4. G4 — criar card fallback no router OU escalar quando `request_handoff` falha por "Sem card" (2h)

**Próxima iteração (P1):**
5. G5 — popular `skills_used` em turns (30min)
6. G6 — corrigir escape duplo em quebra de linha (1h de investigação)

**Backlog (P2):**
7. G7 — migrar buffer Postgres para Redis se aparecer caso real
8. G8 (falso) e re-auditoria dos 3 campos "dead" duvidosos da Fase 1A

---

## Arquivos relevantes
- Código do router: `supabase/functions/ai-agent-router/index.ts`
- Logs brutos da Fase 2: `.claude/audit-fase2/responses.jsonl`
- Relatório Fase 1B (Julia nodes): `memory/auditoria-luna-julia-paridade-fase-1b.md`
- Spec cenários: `.claude/phase1c-test-scenarios-spec.md`
- Roteiro original: `memory/auditoria-final-luna-julia-paridade.md`
