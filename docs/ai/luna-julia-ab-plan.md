# Luna vs Julia — Plano de A/B em Produção

**Data:** 2026-04-14  
**Fase:** C6 — Auditoria + Preparação  
**Status:** Proposta (não executada ainda)

---

## Objetivo

Validar que Luna (agente de edge function) responde com qualidade comparável à Julia (workflow n8n) em conversas reais antes de considerá-la pronta para substituir Julia.

---

## 1. Preparação (antes de ativar Luna)

### 1.1 Canalização

**Selecione UM linha WhatsApp para o piloto:**

- ✅ **Ideal:** Linha **não-oficial** (UUID, não numeric phone_id)
- ✅ **Critério:** Baixo volume (< 100 msgs/dia) + contatos conhecidos ou recorrentes
- ❌ **Evitar:** Linhas oficiais Meta, linhas de alto volume, leads críticos de cliente grande

**Por quê?**
- Linha não-oficial aceita texto livre (sem templates HSM)
- Baixo volume = fácil de monitorar + risco baixo se houver glitch
- Contatos conhecidos = feedback qualitativo mais confiável

**Exemplo:** Linha interna de testes, linha de um cliente pequeno, linha de suporte interno.

### 1.2 Configuração de Luna

**Em staging:**
- ✅ RPCs alinhadas (`agent_check_calendar`, `agent_request_handoff`) — migration 20260414t aplicada
- ✅ Luna agent record criado (20260414u aplicada)
- ✅ Edge function deployada (`/functions/ai-agent-router` ou similar) — verificar status

**Antes de ativar em staging:**
```bash
# 1. Validar que edge function responde
curl -X POST https://staging-project.supabase.co/functions/v1/ai-agent-router \
  -H "Authorization: Bearer $SUPABASE_JWT" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "90b0b80b-77a1-48f5-9bf0-b65335044dbe", "message": "Oi!", ...}'

# 2. Validar que Luna rota pra essa linha (se houver routing rules)
```

### 1.3 Período de Piloto

**Duração sugerida:** 7-10 dias

- Dias 1-3: Pré-piloto (Vitor testa com contato dele)
- Dias 4-7: Piloto (Luna responde em paralelo a Julia, sem substituir)
- Dias 8-10: Análise qualitativa + decisão

---

## 2. Execução — Luna em Paralelo (não substitui Julia ainda)

### 2.1 Arquitetura do Teste

**Configuração:**
- Linha WhatsApp não-oficial ativada para Luna
- Julia continua respondendo na mesma linha OU em linha paralela (conforme setup)
- **Meta:** Coletar mensagens de Luna por 7 dias, comparar com últimas conversas da Julia

### 2.2 Coleta de Dados

**O que rastrear:**

1. **Respostas de Luna**
   - Mensagens enviadas (count)
   - Tokens/caracteres (média por resposta)
   - Tempo de latência (desde "message received" até "response sent")
   - Erros/timeouts (count)

2. **Interações qualitativas**
   - Cliente responde ou abandona?
   - Tom da resposta (comparar com Julia)
   - Pergunta relevante ou repetida?
   - Conseguiu qualificar lead ou pediu handoff?

3. **Decisões de Luna**
   - Criou reunião (função `check_calendar`)?
   - Atribuiu tag (função `assign_tag`)?
   - Pediu handoff (função `request_handoff`)?
   - Com que frequência?

**Tabelas pra monitorar:**
```sql
-- Mensagens de Luna
SELECT * FROM ai_conversation_turns
WHERE agent_id = '90b0b80b-77a1-48f5-9bf0-b65335044dbe'
  AND created_at >= '2026-04-XX'::date
ORDER BY created_at DESC;

-- Uso de skills/tools
SELECT * FROM ai_skill_usage_logs
WHERE agent_id = '90b0b80b-77a1-48f5-9bf0-b65335044dbe'
  AND created_at >= '2026-04-XX'::date;

-- Atividades (handoffs, tags)
SELECT * FROM activities
WHERE description LIKE '%Luna%' OR description LIKE '%handoff%'
  AND created_at >= '2026-04-XX'::date;
```

---

## 3. Comparação Qualitativa (após 7 dias)

### 3.1 Métrica 1: Tone & Naturalness

**Pergunta:** "Luna soa tão humano e acolhedor quanto Julia?"

- **Scoring:** 1-5 (1=robótico, 5=natural)
- **Método:** Vitor lê 10-20 conversas de Luna e compara com histórico Julia
- **Critério de aprovação:** ≥ 4/5

**O que procurar:**
- Repetição de frases genéricas (sinal: score baixo)
- Contexto apropriado pra conversa (sinal: score alto)
- Emojis moderados (sinal: bom balanço)
- Responde pergunta do cliente vs responde outra coisa (sinal: alinhamento)

### 3.2 Métrica 2: Handoff Rate

**Pergunta:** "Luna pede handoff com frequência apropriada?"

- **Esperado (Julia):** ~10-15% das conversas terminam em handoff
- **Aceitável (Luna):** 8-20% (margem de ±5%)
- **Alerta:** < 5% (Luna não escalando) ou > 25% (Luna muito conservadora)

**Método:** 
```
handoff_count = SELECT COUNT(*) FROM activities 
  WHERE description LIKE '%handoff%' AND agent_id = luna
handoff_rate = handoff_count / total_conversations
```

### 3.3 Métrica 3: Tool Usage

**Pergunta:** "Luna usa as ferramentas (check_calendar, assign_tag) com bom senso?"

- **Esperado:** Quando relevante, Luna chama ferramenta
- **Alerta vermelho:** Nunca chama ferramentas (bug) ou chama a toda hora (loop)

**Método:**
```sql
SELECT skill_name, COUNT(*) as usage_count
FROM ai_skill_usage_logs
WHERE agent_id = luna AND created_at >= start_date
GROUP BY skill_name
ORDER BY usage_count DESC;
```

### 3.4 Métrica 4: Erro Rate

**Pergunta:** "Luna falha ou demora?"

- **Esperado:** < 2% de erros/timeouts
- **Alerta:** > 5% = problema no edge function

**Método:**
```sql
SELECT 
  COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(CASE WHEN status = 'error' THEN 1 END) / COUNT(*), 2) as error_rate
FROM ai_conversation_turns
WHERE agent_id = luna AND created_at >= start_date;
```

---

## 4. Critério de Sucesso (Go/No-Go)

### 4.1 Go — Luna substitui Julia

**Todos os critérios abaixo devem ser satisfeitos:**

- ✅ Tone score ≥ 4/5 (conversas são naturais)
- ✅ Handoff rate 8-20% (nem conservadora, nem precipitada)
- ✅ Tool usage apropriado (quando chama, é no contexto certo)
- ✅ Error rate < 2% (confiável)
- ✅ Latência < 3s (não atrasa conversa)
- ✅ Vitor aprova ("tá bom, pode usar")

**Ação:** Ativar Luna em linha de produção; desativar Julia (ou manter como fallback)

### 4.2 No-Go — Luna precisa de ajustes

**Se algum critério falhar:**

- 🔴 Tone score < 4/5 → Revisar prompts (C2 — Frente C2)
- 🔴 Handoff rate < 8% → Revisar sinais de handoff (C3)
- 🔴 Tool usage errado → Debugar edge function ou RPCs
- 🔴 Error rate > 5% → Verificar logs de edge function (timeout? out of memory?)
- 🔴 Latência > 5s → Revisar modelo (talvez precisa de modelo mais rápido?)

**Ação:** Voltar pra staging, consertar, re-testar

---

## 5. Rollback (se der errado em produção)

**Se Luna for ativada e depois descobrir problema:**

1. **Imediato (< 1 hora):**
   - Desativar Luna: `UPDATE ai_agents SET ativa = false WHERE id = luna_id`
   - Reativar Julia: `UPDATE ai_agents SET ativa = true WHERE id = julia_id`
   - Criar issue de alert com logs

2. **Análise (próximas 24h):**
   - Coletar erros de Luna (Sentry, logs de edge function)
   - Comparar prompts com Julia (docs/ai/julia-prompts.md vs Luna config)
   - Validar RPCs comportaram corretamente

3. **Correção:**
   - Aplicar fix em staging
   - Re-testar com piloto de 2-3 dias antes de re-ativar em produção

---

## 6. Roadmap Pós-Sucesso (Luna → Default)

Uma vez que Luna estiver pronta:

1. **Frente C2** (Semanas 1-2): Editor de agentes com abas (Identidade, Prompts, Modelos, etc)
2. **Frente C3** (Semanas 2-3): Handoff inteligente + decisões habilitáveis
3. **Frente C4** (Semanas 3): Knowledge Base compartilhável
4. **Frente C5** (Semanas 4): Wizard refatorado (11 passos)
5. **Frente C7** (Semanas 5): Modo de teste (simular conversa ao vivo)

Cada frente entrega testabilidade incremental. Vitor valida antes de seguir pra próxima.

---

## 7. Checklist Pré-Piloto

- [ ] Edge function `/ai-agent-router` deployada
- [ ] Luna agent record criado (20260414u aplicada em staging)
- [ ] RPCs alinhadas: `agent_check_calendar`, `agent_request_handoff` (20260414t aplicada)
- [ ] Linha WhatsApp não-oficial configurada pra Luna
- [ ] Julia continua respondendo (em paralelo ou fallback)
- [ ] Monitoramento ativo (dashboard ou queries prontas)
- [ ] Vitor sabe como acessar conversas de Luna
- [ ] Sentry/logs apontando pra erros de Luna

---

## 8. Contatos de Teste

**Pra enviar mensagens de teste durante o piloto:**

- Sugestão: Use o próprio número de Vitor (11964293533) ou contato interno
- **NUNCA** use lista real de clientes ou leads — se houver problema, afeta negócio real
- Mensagens de teste: "Oi, tudo bem?", "Quero ir pro Egito", "Qual a taxa?", etc

---

## Conclusão

Este plano é **conservador e rastreável**. Objetivo é **remover incerteza** sobre paridade Luna/Julia com dados reais antes de substituir Julia completamente.

Se tudo der certo, Vitor aprova em ~7 dias. Se não, temos diagnóstico claro pra consertar.

**Próximo passo:** Quando Vitor disser "pode começar o piloto", ativar Luna na linha de teste + iniciar rastreamento.
