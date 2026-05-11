# Auditoria Luna ↔ Julia — Fase 1C: Spec Executável dos 15 Cenários

**Data:** 2026-04-21  
**Responsável:** Fase 2 (disparar curl via script de teste)  
**Próximo:** Fase 2 (rodar curl 15×, coletar outputs, validar em SQL)

---

## Contexto e Configuração Pré-Teste

### IDs Críticos (fixos)
```
Luna agent_id:     0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8
Phone line_id:     42bc3bb9-10e7-4f2c-b82e-a478ad458459
Phone number_id:   da3edcc0-a04a-4962-aa68-13758ec409be
Pipeline id:       c8022522-4a1d-411c-9387-efe03ca725ee
Org (Welcome Trips): b0000000-0000-0000-0000-000000000001
Handoff target:    163da577-e33f-424d-85b9-732317138eea (Conectado)
Test phone:        5511900000099 (test_mode_phone_whitelist — não envia real)
Keywords obrigat.:  cotacao, orcamento, preco, viagem, reserva, comprar, contratar
```

### Edge Function Endpoint
```
POST https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/ai-agent-router
Header: Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY
Header: Content-Type: application/json
```

### Setup SQL Pré-Teste
```sql
-- Criar contato de teste (se não existir)
INSERT INTO contatos (org_id, nome, phone_number, created_by_id)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'Teste Luna Fase 1C',
  '5511900000099',
  'b0000000-0000-0000-0000-000000000002'  -- user de teste
)
ON CONFLICT (org_id, phone_number) DO NOTHING;

-- Criar card de teste para alguns cenários (ver abaixo)
INSERT INTO cards (
  org_id, contato_id, product, pipeline_stage_id, 
  nome_da_viagem, data_criacao, criado_por
)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  (SELECT id FROM contatos WHERE phone_number='5511900000099' LIMIT 1),
  'TRIPS',
  (SELECT id FROM pipeline_stages WHERE pipeline_id='c8022522-4a1d-411c-9387-efe03ca725ee' LIMIT 1),
  'Teste Fase 1C',
  NOW(),
  'b0000000-0000-0000-0000-000000000002'
)
ON CONFLICT DO NOTHING;
```

---

## 15 Cenários Detalhados

### Cenário 1: Primeira Mensagem — Keyword Válida (Happy Path)

**Objetivo:** Luna recebe primeira msg com keyword obrigatória, cria card, responde.

**Setup SQL:**
```sql
DELETE FROM whatsapp_messages 
WHERE contact_phone='5511900000099' AND phone_number_id='da3edcc0-a04a-4962-aa68-13758ec409be';

DELETE FROM ai_conversation_turns 
WHERE contact_phone='5511900000099';

DELETE FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001' AND nome_da_viagem LIKE '%Cenario1%';
```

**Payload:**
```json
{
  "contact_phone": "5511900000099",
  "message_text": "Oi! Quero cotar uma viagem pro Egito em agosto. Qual é o preço?",
  "message_type": "text",
  "phone_number_label": "WhatsApp Test",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Cenário 1 — Primeira Msg",
  "whatsapp_message_id": "wamid.1c1-msg-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Card foi criado
SELECT COUNT(*) as cards_created 
FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001' 
  AND (SELECT nome FROM contatos WHERE id=contato_id LIMIT 1) LIKE '%Cenário 1%'
LIMIT 1;
-- Esperado: 1

-- 2. Turno de conversa foi registrado
SELECT COUNT(*) as turns 
FROM ai_conversation_turns 
WHERE contact_phone='5511900000099' AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
LIMIT 1;
-- Esperado: ≥ 1

-- 3. Resposta foi enviada para WhatsApp
SELECT COUNT(*), MAX(created_at) as ultima_resposta
FROM whatsapp_messages 
WHERE contact_phone='5511900000099' AND direction='outbound'
LIMIT 1;
-- Esperado: ≥ 1, recente
```

**Output Esperado:**
- Status HTTP 200
- Response body: `{ "status": "success", "message_count": 1-3, ... }`
- Mensagem em PT-BR natural
- Primeira qualificação começada (pergunta sobre destino ou período)
- NENHUMA menção a "IA", "sistema", "processa"

---

### Cenário 2: Segunda Mensagem — Responder Pergunta de Qualificação

**Objetivo:** Luna mantém contexto entre turnos, avança qualificação.

**Setup SQL:**
```sql
-- Usar contato + card do Cenário 1 (acima)
-- Adicionar histórico artificial (simular turno anterior)

UPDATE ai_conversation_turns 
SET message_history=jsonb_set(
  COALESCE(message_history, '[]'::jsonb),
  '{-1}',
  jsonb_build_object(
    'role', 'user',
    'content', 'Oi! Quero cotar uma viagem pro Egito em agosto.'
  )
)
WHERE contact_phone='5511900000099' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
ORDER BY created_at DESC LIMIT 1;
```

**Payload:**
```json
{
  "contact_phone": "5511900000099",
  "message_text": "Somos 4 pessoas. Agosto todo, primeira semana é mais importante.",
  "message_type": "text",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Cenário 1",
  "whatsapp_message_id": "wamid.1c1-msg-002"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Histórico cresceu
SELECT COUNT(*) as history_size
FROM (
  SELECT jsonb_array_length(message_history) as arr_len
  FROM ai_conversation_turns 
  WHERE contact_phone='5511900000099' 
    AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
  ORDER BY created_at DESC LIMIT 1
) t;
-- Esperado: ≥ 2 (user turn 1 + Luna turn 1 + user turn 2 + Luna turn 2)

-- 2. Card ainda não agendou reunião (não pra esse cenário)
SELECT COUNT(*) as reunioes
FROM activities 
WHERE card_id=(SELECT id FROM cards WHERE org_id='b0000000-0000-0000-0000-000000000001' 
               AND (SELECT nome FROM contatos WHERE id=contato_id LIKE '%Cenário 1%') LIMIT 1)
  AND tipo='reuniao';
-- Esperado: 0 (qualificação ainda em andamento)
```

**Output Esperado:**
- Resposta reflete que entendeu "4 pessoas + agosto todo"
- Pergunta próxima etapa (orçamento ou experiências)
- Resposta coerente com turno anterior (não repete perguntas)

---

### Cenário 3: Club Med Detection & Special Scenario

**Objetivo:** Luna detecta "Club Med" em mensagem, aplica tag, simplifica qualificação.

**Setup SQL:**
```sql
DELETE FROM whatsapp_messages 
WHERE contact_phone='5511900001199';

DELETE FROM ai_conversation_turns 
WHERE contact_phone='5511900001199';

DELETE FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001' 
  AND (SELECT nome FROM contatos WHERE phone_number='5511900001199' LIMIT 1) IS NOT NULL;

-- Contato Club Med
INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Club Med Tester', '5511900001199')
ON CONFLICT DO NOTHING;
```

**Payload:**
```json
{
  "contact_phone": "5511900001199",
  "message_text": "Oi! Estamos planejando um Club Med no Ceará para dezembro com minha família.",
  "message_type": "text",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Club Med Tester",
  "whatsapp_message_id": "wamid.1c1-msg-clubmed-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Tag "Club Med" foi aplicada ao card
SELECT COUNT(*) as club_med_tags
FROM card_tags ct
JOIN tags t ON ct.tag_id = t.id
WHERE t.nome='Club Med' 
  AND ct.card_id=(SELECT id FROM cards WHERE org_id='b0000000-0000-0000-0000-000000000001'
                  AND (SELECT id FROM contatos WHERE phone_number='5511900001199' LIMIT 1)=contato_id LIMIT 1);
-- Esperado: 1

-- 2. skill_usage_logs mostra assign_tag foi chamado
SELECT COUNT(*) as assign_tag_calls
FROM ai_skill_usage_logs 
WHERE contact_phone='5511900001199' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
  AND skill_name='assign_tag';
-- Esperado: ≥ 1

-- 3. Resposta de Luna menciona "planner especializado" (encerramento Club Med)
SELECT COUNT(*) as encerramento_msgs
FROM whatsapp_messages 
WHERE contact_phone='5511900001199' AND direction='outbound'
  AND body ILIKE '%planner%especializado%';
-- Esperado: ≥ 1
```

**Output Esperado:**
- Resposta reconhece Club Med (não oferece taxa R$ 500)
- Simplifica qualificação (só resort, datas, quantidade pessoas)
- Finaliza com handoff elegante ("planner especializado vai entrar em contato")
- Tag Club Med aplicada no card

---

### Cenário 4: Handoff Manual (Request Handoff)

**Objetivo:** Cliente insiste em falar com humano; Luna faz request_handoff + muda stage.

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Handoff Tester', '5511900002299')
ON CONFLICT DO NOTHING;

-- Criar card em andamento
INSERT INTO cards (
  org_id, contato_id, product, pipeline_stage_id, nome_da_viagem
)
SELECT 
  'b0000000-0000-0000-0000-000000000001',
  id,
  'TRIPS',
  (SELECT id FROM pipeline_stages WHERE pipeline_id='c8022522-4a1d-411c-9387-efe03ca725ee' LIMIT 1),
  'Handoff Test'
FROM contatos WHERE phone_number='5511900002299' LIMIT 1
ON CONFLICT DO NOTHING;
```

**Payload (3 mensagens sequenciais):**

```json
{
  "contact_phone": "5511900002299",
  "message_text": "Oi! Quero informações sobre viagem para o Caribe em dezembro. Qual é o processo?",
  "message_type": "text",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Handoff Tester",
  "whatsapp_message_id": "wamid.1c1-msg-hand-001"
}
```

```json
{
  "contact_phone": "5511900002299",
  "message_text": "Tá bom. Somos 5 pessoas em agosto de 2026.",
  "whatsapp_message_id": "wamid.1c1-msg-hand-002"
}
```

```json
{
  "contact_phone": "5511900002299",
  "message_text": "Na verdade, eu prefiro falar com uma pessoa de verdade. Tem alguém aí que pode me atender?",
  "whatsapp_message_id": "wamid.1c1-msg-hand-003"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. request_handoff foi chamado (skill_usage_logs)
SELECT COUNT(*) as handoff_calls
FROM ai_skill_usage_logs 
WHERE contact_phone='5511900002299' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
  AND skill_name='request_handoff';
-- Esperado: ≥ 1

-- 2. Card mudou de stage para "Conectado" (handoff_actions.change_stage_id)
SELECT pipeline_stage_id, (SELECT nome FROM pipeline_stages WHERE id=cards.pipeline_stage_id) as stage_name
FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001'
  AND (SELECT nome FROM contatos WHERE id=contato_id) LIKE '%Handoff%' LIMIT 1;
-- Esperado: stage_name = 'Conectado'

-- 3. Activity de handoff foi registrada
SELECT COUNT(*) as handoff_activities
FROM activities 
WHERE card_id=(SELECT id FROM cards WHERE org_id='b0000000-0000-0000-0000-000000000001'
               AND (SELECT nome FROM contatos WHERE id=contato_id) LIKE '%Handoff%' LIMIT 1)
  AND tipo='handoff';
-- Esperado: ≥ 1
```

**Output Esperado:**
- Luna não insiste em qualificar mais
- Responde naturalmente: "Vou verificar aqui e te retorno em breve!"
- Card muda para stage "Conectado"
- Activity de handoff criada

---

### Cenário 5: Agendamento com Check Calendar

**Objetivo:** Luna passa por qualificação completa, usa check_calendar, cria reunião.

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number, email)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Calendar Tester', '5511900003399', 'teste@welcometrips.com.br')
ON CONFLICT DO NOTHING;

-- Pré-criar card na etapa "Qualificado"
INSERT INTO cards (
  org_id, contato_id, product, pipeline_stage_id, nome_da_viagem,
  mkt_destino, mkt_quem_vai_viajar_junto, mkt_pretende_viajar_tempo,
  mkt_valor_por_pessoa_viagem
)
SELECT 
  'b0000000-0000-0000-0000-000000000001',
  id,
  'TRIPS',
  (SELECT id FROM pipeline_stages WHERE pipeline_id='c8022522-4a1d-411c-9387-efe03ca725ee' 
   AND nome='Qualificado' LIMIT 1),
  'Calendar Test',
  'Maldivas', '3 casais', 'dezembro 2026', '100000'
FROM contatos WHERE phone_number='5511900003399' LIMIT 1
ON CONFLICT DO NOTHING;
```

**Payload:**
```json
{
  "contact_phone": "5511900003399",
  "message_text": "Ótimo! Já decidi — queremos as Maldivas em dezembro com 3 casais. Orçamento é 100 mil total. Quando a gente marca uma reunião?",
  "message_type": "text",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Calendar Tester",
  "whatsapp_message_id": "wamid.1c1-msg-cal-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. check_calendar skill foi chamado
SELECT COUNT(*) as calendar_checks
FROM ai_skill_usage_logs 
WHERE contact_phone='5511900003399' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
  AND skill_name='check_calendar';
-- Esperado: ≥ 1

-- 2. create_task foi chamado (reunião agendada)
SELECT COUNT(*) as tasks_created
FROM ai_skill_usage_logs 
WHERE contact_phone='5511900003399' 
  AND skill_name='create_task';
-- Esperado: ≥ 1

-- 3. Activity de tipo "reuniao" foi criada
SELECT COUNT(*) as reunioes
FROM activities 
WHERE card_id=(SELECT id FROM cards WHERE org_id='b0000000-0000-0000-0000-000000000001'
               AND (SELECT nome FROM contatos WHERE id=contato_id)='Calendar Tester' LIMIT 1)
  AND tipo='reuniao';
-- Esperado: ≥ 1

-- 4. Resposta de Luna confirma agendamento
SELECT COUNT(*) as confirmacao_msgs
FROM whatsapp_messages 
WHERE contact_phone='5511900003399' AND direction='outbound'
  AND body ILIKE '%agendada%reuniao%';
-- Esperado: ≥ 1
```

**Output Esperado:**
- Luna chama check_calendar (obtém horários disponíveis da consultora)
- Oferece 2-3 opções de horário
- Pede e-mail (joga de volta na msg anterior: "teste@welcometrips.com.br")
- Cria task/reunião via create_task
- Confirma em 1 frase: "Pronto! Reunião agendada pra [dia] às [hora]..."

---

### Cenário 6: Fallback — Agent Ativa=False (Degradação)

**Objetivo:** Luna ativa=false, resposta cai para fallback message ou Julia (n8n).

**Setup SQL:**
```sql
-- ANTES: desativar Luna
UPDATE ai_agents 
SET ativa=false 
WHERE id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';

INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Fallback Tester', '5511900004499')
ON CONFLICT DO NOTHING;

-- DEPOIS de testar: reativar Luna
-- UPDATE ai_agents SET ativa=true WHERE id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';
```

**Payload:**
```json
{
  "contact_phone": "5511900004499",
  "message_text": "Oi! Preciso de uma cotação de viagem urgente!",
  "message_type": "text",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Fallback Tester",
  "whatsapp_message_id": "wamid.1c1-msg-fallback-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. ai_conversation_turns NÃO registrou Luna
SELECT COUNT(*) as luna_turns
FROM ai_conversation_turns 
WHERE contact_phone='5511900004499' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';
-- Esperado: 0 (Luna desativada)

-- 2. Router retornou fallback_message OU delegou para Julia (n8n_webhook_url)
SELECT response_status, error_message 
FROM ai_conversation_turns 
WHERE contact_phone='5511900004499'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: fallback message ou n8n delegation

-- 3. Resposta foi enviada (fallback ou Julia)
SELECT COUNT(*) as msgs_enviadas
FROM whatsapp_messages 
WHERE contact_phone='5511900004499' AND direction='outbound';
-- Esperado: ≥ 1
```

**Output Esperado:**
- HTTP 200 (não falha)
- Router detecta ativa=false
- Cai para fallback_message OU delega para Julia (n8n_webhook_url)
- Resposta enviada ao cliente (sem interrupção)

---

### Cenário 7: Timeout/Rate Limiting (Webhook Retry)

**Objetivo:** Luna falha inicialmente (timeout), edge function repolinga (exponential backoff).

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Timeout Tester', '5511900005599')
ON CONFLICT DO NOTHING;
```

**Payload:**
```json
{
  "contact_phone": "5511900005599",
  "message_text": "Oi, preciso cotar um cruzeiro para o Caribe em Janeiro de 2027!",
  "message_type": "text",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Timeout Tester",
  "whatsapp_message_id": "wamid.1c1-msg-timeout-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Turno foi registrado com status=success (retry interno funcionou)
SELECT response_status, error_message 
FROM ai_conversation_turns 
WHERE contact_phone='5511900005599' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: status='success' (mesmo que tenha havido retry)

-- 2. Resposta foi entregue
SELECT COUNT(*) as msgs
FROM whatsapp_messages 
WHERE contact_phone='5511900005599' AND direction='outbound';
-- Esperado: ≥ 1
```

**Output Esperado:**
- Mesmo com possível timeout interno, edge function retorna 200
- Retry exponencial absorveu a falha
- Cliente recebe resposta

---

### Cenário 8: Multimodal — Áudio/Imagem (Media URL)

**Objetivo:** Luna recebe áudio ou imagem, extrai texto, responde normalmente.

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Multimodal Tester', '5511900006699')
ON CONFLICT DO NOTHING;
```

**Payload (Áudio):**
```json
{
  "contact_phone": "5511900006699",
  "message_text": "[áudio transcrito: Oi, quero cotar uma viagem de prêmio pro Egito em setembro]",
  "message_type": "audio",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Multimodal Tester",
  "whatsapp_message_id": "wamid.1c1-msg-audio-001",
  "media_url": "https://fake-media.s3.amazonaws.com/audio-001.ogg"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Turno registrou que era multimodal
SELECT message_type, media_url
FROM ai_conversation_turns 
WHERE contact_phone='5511900006699' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: message_type='audio', media_url preenchido

-- 2. Luna respondeu normalmente (não tentou processar áudio direto)
SELECT COUNT(*) as respostas
FROM whatsapp_messages 
WHERE contact_phone='5511900006699' AND direction='outbound';
-- Esperado: ≥ 1
```

**Output Esperado:**
- Luna processa transcription do áudio
- Responde como se fosse texto normal
- Avança qualificação normalmente

---

### Cenário 9: Múltiplas Mensagens Sequenciais (Debounce/Race Condition)

**Objetivo:** Cliente envia 3 msgs rápido; Luna não cria 3 cards, gerencia race condition.

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Race Condition Tester', '5511900007799')
ON CONFLICT DO NOTHING;
```

**Payload (3 mensagens em sequência rápida — < 1s entre elas):**

```json
{
  "contact_phone": "5511900007799",
  "message_text": "Oi! Tudo bem? Quero saber sobre viagens pro Japão.",
  "whatsapp_message_id": "wamid.1c1-msg-race-001"
}
```

```json
{
  "contact_phone": "5511900007799",
  "message_text": "Somos 2 pessoas, queremos ir em abril.",
  "whatsapp_message_id": "wamid.1c1-msg-race-002"
}
```

```json
{
  "contact_phone": "5511900007799",
  "message_text": "Qual é a taxa de planejamento?",
  "whatsapp_message_id": "wamid.1c1-msg-race-003"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Apenas 1 card foi criado (não 3)
SELECT COUNT(*) as card_count
FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001'
  AND (SELECT nome FROM contatos WHERE id=contato_id)='Race Condition Tester';
-- Esperado: 1

-- 2. 3 turnos de conversa foram registrados (não duplicados)
SELECT COUNT(*) as turn_count
FROM ai_conversation_turns 
WHERE contact_phone='5511900007799' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';
-- Esperado: 3

-- 3. Resposta única (não 3 respostas separadas)
SELECT COUNT(*) as msg_count
FROM whatsapp_messages 
WHERE contact_phone='5511900007799' AND direction='outbound';
-- Esperado: 1-3 (agrupadas naturalmente, não duplicadas)
```

**Output Esperado:**
- Debounce/coalescing funcionou: só 1 card para o contato
- Luna responde AO CONJUNTO das 3 msgs, não 3x
- Qualificação avança (entendeu 2 pessoas + abril)

---

### Cenário 10: Null Owner / Org Não Identificável

**Objetivo:** Mensagem chega mas contato_id = NULL ou org indetectável; edge function não falha.

**Setup SQL:**
```sql
-- Enviar de número que NÃO está em contatos
-- (vai criar contato on-the-fly ou registrar como unassigned)
```

**Payload:**
```json
{
  "contact_phone": "5588900008899",
  "message_text": "Oi, quero viajar pra Europa em outubro!",
  "message_type": "text",
  "phone_number_id": "da3edcc0-a04a-4962-aa68-13758ec409be",
  "contact_name": "Unknown Tester",
  "whatsapp_message_id": "wamid.1c1-msg-null-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Mesmo sem contato pré-existente, turno foi registrado
SELECT COUNT(*) as turns_recorded
FROM ai_conversation_turns 
WHERE contact_phone='5588900008899' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';
-- Esperado: ≥ 1 (edge function não falhou)

-- 2. Contato foi criado on-the-fly OU marcado como unassigned
SELECT COUNT(*) as contatos
FROM contatos 
WHERE org_id='b0000000-0000-0000-0000-000000000001' 
  AND phone_number='5588900008899';
-- Esperado: ≥ 1

-- 3. Card foi criado (mesmo que sem owner)
SELECT COUNT(*) as cards
FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001'
  AND (SELECT id FROM contatos WHERE phone_number='5588900008899' LIMIT 1)=contato_id;
-- Esperado: ≥ 1
```

**Output Esperado:**
- HTTP 200 (não 404 ou 500)
- Contato criado automaticamente
- Card criado
- Resposta enviada

---

### Cenário 11: Pause Permanently (Agent Ativa=False + pause_permanently=True)

**Objetivo:** Agent com pause_permanently=true não responde, cai para fallback permanente.

**Setup SQL:**
```sql
-- Marcar Luna como pause_permanently=true
UPDATE ai_agents 
SET pause_permanently=true, ativa=false
WHERE id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';

INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Pause Test', '5511900009999')
ON CONFLICT DO NOTHING;

-- DEPOIS: remover pause
-- UPDATE ai_agents SET pause_permanently=false, ativa=true WHERE id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';
```

**Payload:**
```json
{
  "contact_phone": "5511900009999",
  "message_text": "Oi! Quero uma proposta de viagem!",
  "whatsapp_message_id": "wamid.1c1-msg-pause-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Luna turns = 0
SELECT COUNT(*) as luna_turns
FROM ai_conversation_turns 
WHERE contact_phone='5511900009999' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';
-- Esperado: 0

-- 2. Router retornou fallback imediatamente
SELECT response_status 
FROM whatsapp_messages 
WHERE contact_phone='5511900009999' AND direction='outbound'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: fallback_message ou n8n delegation
```

**Output Esperado:**
- HTTP 200
- Router checou pause_permanently antes de chamar Luna
- Fallback enviado

---

### Cenário 12: Escalation via Intelligent Decisions (Tag + Move Stage)

**Objetivo:** Luna detecta escalation trigger, aplica tag, move card para "Escalado".

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'Escalation Tester', '5511900010010')
ON CONFLICT DO NOTHING;

-- Pré-criar card em "Qualificado"
INSERT INTO cards (
  org_id, contato_id, product, pipeline_stage_id, nome_da_viagem
)
SELECT 
  'b0000000-0000-0000-0000-000000000001',
  id,
  'TRIPS',
  (SELECT id FROM pipeline_stages WHERE pipeline_id='c8022522-4a1d-411c-9387-efe03ca725ee' 
   AND nome='Qualificado' LIMIT 1),
  'Escalation Test'
FROM contatos WHERE phone_number='5511900010010' LIMIT 1
ON CONFLICT DO NOTHING;
```

**Payload:**
```json
{
  "contact_phone": "5511900010010",
  "message_text": "Na verdade, estou planejando uma lua de mel ultra premium em Bora Bora com muito luxo. Orçamento é ilimitado, mas precisa de uma pessoa super experiente em viagens de 7 estrelas.",
  "whatsapp_message_id": "wamid.1c1-msg-escal-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. intelligent_decisions foram aplicadas (tag + stage move)
SELECT COUNT(*) as tags_applied
FROM card_tags ct
JOIN tags t ON ct.tag_id = t.id
WHERE ct.card_id=(SELECT id FROM cards WHERE org_id='b0000000-0000-0000-0000-000000000001'
                  AND (SELECT nome FROM contatos WHERE phone_number='5511900010010' LIMIT 1)=contato_id LIMIT 1);
-- Esperado: ≥ 1 (tag "Premium" ou similar)

-- 2. Card moveu de stage
SELECT pipeline_stage_id, (SELECT nome FROM pipeline_stages WHERE id=cards.pipeline_stage_id) as stage_name
FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001'
  AND (SELECT nome FROM contatos WHERE id=contato_id)='Escalation Tester' LIMIT 1;
-- Esperado: stage_name != 'Qualificado' (moveu pra "Escalado" ou similar)
```

**Output Esperado:**
- Luna detectou "ultra premium", "7 estrelas", "experiente"
- Aplicou tag inteligente
- Moveu card para stage apropriado
- Resposta reflete escalação ("vou passar pro nosso especialista")

---

### Cenário 13: Keyword Missing (Desqualificação Automática)

**Objetivo:** Mensagem SEM keyword obrigatória; Luna não qualifica, oferece fallback.

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number)
VALUES ('b0000000-0000-0000-0000-000000000001', 'No Keyword Tester', '5511900011011')
ON CONFLICT DO NOTHING;
```

**Payload:**
```json
{
  "contact_phone": "5511900011011",
  "message_text": "Olá, tudo bem? Como vocês estão?",
  "whatsapp_message_id": "wamid.1c1-msg-nokw-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Card foi criado ou não, dependendo da policy
SELECT COUNT(*) as cards
FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001'
  AND (SELECT nome FROM contatos WHERE phone_number='5511900011011' LIMIT 1)=contato_id;
-- Esperado: 0 (sem keyword, sem card)

-- 2. Turno NÃO registrou Luna (routing_criteria.keywords não atendido)
SELECT COUNT(*) as luna_turns
FROM ai_conversation_turns 
WHERE contact_phone='5511900011011' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';
-- Esperado: 0

-- 3. Mensagem de fallback foi enviada
SELECT COUNT(*) as fallback_msgs
FROM whatsapp_messages 
WHERE contact_phone='5511900011011' AND direction='outbound';
-- Esperado: ≥ 1 (ou nada, dependendo da policy)
```

**Output Esperado:**
- Router checou routing_criteria.keywords
- "cotacao, orcamento, preco, viagem, reserva, comprar, contratar" não encontrados
- Luna não foi chamada
- Fallback ou nada enviado

---

### Cenário 14: Multicontact (Pessoa + Traveler) — Contact Role Detection

**Objetivo:** Msg vem de "viajante" (traveler), Luna adapta tom (acolhedor, não qualifica taxa).

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number, role, parent_contact_id)
SELECT 
  'b0000000-0000-0000-0000-000000000001',
  'Viajante Teste',
  '5511900012012',
  'traveler',
  (SELECT id FROM contatos WHERE org_id='b0000000-0000-0000-0000-000000000001' 
   AND role='primary' LIMIT 1)
ON CONFLICT DO NOTHING;
```

**Payload:**
```json
{
  "contact_phone": "5511900012012",
  "message_text": "Oi! Sou a filha do João. Vocês aceitam crianças em viagens internacionais? Qual é a documentação?",
  "contact_name": "Viajante Teste",
  "whatsapp_message_id": "wamid.1c1-msg-traveler-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. contact_role foi detectado como "traveler"
SELECT contact_role
FROM ai_conversation_turns 
WHERE contact_phone='5511900012012' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: 'traveler'

-- 2. Resposta de Luna NÃO menciona taxa/reunião
SELECT body
FROM whatsapp_messages 
WHERE contact_phone='5511900012012' AND direction='outbound'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: NÃO contém "taxa R$", "reunião", "consultora"

-- 3. Resposta é acolhedora + passa pro titular
SELECT COUNT(*) as titular_references
FROM whatsapp_messages 
WHERE contact_phone='5511900012012' AND direction='outbound'
  AND body ILIKE '%%joão%' OR body ILIKE '%titular%';
-- Esperado: ≥ 1 (refere ao titular)
```

**Output Esperado:**
- Luna identificou traveler
- Tom acolhedor ("oi filha!")
- Nunca oferece taxa ou agenda reunião
- Coleta dados de documentação, alimentares
- Refere ao titular para valores

---

### Cenário 15: Webhook Retry + Activity Logging (End-to-End)

**Objetivo:** Mensagem dispara webhook, Luna processa, logs registram tudo (skill calls, stage changes, activities).

**Setup SQL:**
```sql
INSERT INTO contatos (org_id, nome, phone_number, email)
VALUES ('b0000000-0000-0000-0000-000000000001', 'E2E Test', '5511900013013', 'e2e@test.com')
ON CONFLICT DO NOTHING;
```

**Payload (mensagem que vai exercitar vários skills: search_knowledge_base + assign_tag + check_calendar + create_task):**
```json
{
  "contact_phone": "5511900013013",
  "message_text": "Oi! Queremos contratar uma viagem para a Grécia em setembro, somos 4 pessoas e temos um orçamento de 150 mil reais. Podemos agendar uma reunião logo?",
  "whatsapp_message_id": "wamid.1c1-msg-e2e-001"
}
```

**Validações SQL Pós-Teste:**
```sql
-- 1. Turno foi registrado com full context
SELECT 
  id as turn_id,
  contact_phone,
  agent_id,
  message_history,
  skill_calls,
  stage_transition_log
FROM ai_conversation_turns 
WHERE contact_phone='5511900013013' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: turn_id NOT NULL, message_history > 0, skill_calls > 0

-- 2. Todos os skills foram logados
SELECT skill_name, COUNT(*) as call_count
FROM ai_skill_usage_logs 
WHERE contact_phone='5511900013013' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
GROUP BY skill_name
ORDER BY call_count DESC;
-- Esperado: search_knowledge_base, check_calendar, create_task, possibly assign_tag

-- 3. Card foi atualizado (stage, tags, fields)
SELECT id, pipeline_stage_id, (SELECT nome FROM pipeline_stages WHERE id=cards.pipeline_stage_id) as stage
FROM cards 
WHERE org_id='b0000000-0000-0000-0000-000000000001'
  AND (SELECT id FROM contatos WHERE phone_number='5511900013013' LIMIT 1)=contato_id
LIMIT 1;
-- Esperado: stage avançado para "Agendado" ou similar

-- 4. Activities registradas (tags, reunião, handoff se houver)
SELECT tipo, COUNT(*) as count
FROM activities 
WHERE card_id=(SELECT id FROM cards WHERE org_id='b0000000-0000-0000-0000-000000000001'
               AND (SELECT id FROM contatos WHERE phone_number='5511900013013' LIMIT 1)=contato_id LIMIT 1)
GROUP BY tipo;
-- Esperado: reuniao ≥ 1, tag ≥ 0

-- 5. Histórico de webhook logs (se houver tabela de rastreamento)
SELECT response_status, retry_count, error_message
FROM ai_conversation_turns 
WHERE contact_phone='5511900013013' 
  AND agent_id='0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: response_status='success', retry_count ≤ 3
```

**Output Esperado:**
- Turno completo com todos os 5 passos do pipeline
- Skills logados corretamente
- Card atualizado com stage e tags
- Reunião agendada
- Histórico de webhook + retry transparente

---

## Resumo de Execução (Fase 2)

Para cada cenário:

1. **Setup:** Executar SQL de setup
2. **Disparo:** curl -X POST ... < payload.json
3. **Validação:** Executar queries SQL em sequência
4. **Asserção:** Comparar resultado com "esperado"

**Script base (pseudocódigo):**
```bash
#!/bin/bash

ENDPOINT="https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/ai-agent-router"

for scenario in 1 2 3 ... 15; do
  echo "=== Cenário $scenario ==="
  
  # Setup
  psql $DB_URL < "cenario_${scenario}_setup.sql"
  
  # Disparo
  PAYLOAD=$(cat "cenario_${scenario}_payload.json")
  RESPONSE=$(curl -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")
  
  echo "Response: $RESPONSE"
  
  # Validação
  psql $DB_URL < "cenario_${scenario}_validate.sql" > "cenario_${scenario}_result.txt"
  
  # Asserção
  if grep -q "EXPECTED_VALUE" "cenario_${scenario}_result.txt"; then
    echo "✅ PASS"
  else
    echo "❌ FAIL"
  fi
done
```

---

## Observações Finais

- **Timeframe:** ~2-3 horas para 15 cenários (sugerido: 2 por hora)
- **Dependências:** SUPABASE_SERVICE_ROLE_KEY, curl, psql
- **Isolamento:** Usar phone_numbers fake (5511900000099+) para não afetar produção real
- **Rollback:** Luna ativa=true + pause_permanently=false após todos os testes