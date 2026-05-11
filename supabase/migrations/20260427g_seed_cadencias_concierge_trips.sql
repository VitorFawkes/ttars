-- =====================================================================
-- Módulo Concierge — Marco 5 (Cadências seedadas)
-- 20260427f: seed 7 cadence_templates + steps pra Welcome Trips
--
-- Cada template tem 1 step que marca gera_atendimento_concierge=true.
-- Templates nascem com is_active=false para equipe ativar manualmente.
--
-- Nota: o motor de cadências (cadence-engine edge function) ainda precisa
-- ser estendido pra ler o flag gera_atendimento_concierge e chamar
-- rpc_criar_atendimento_concierge além de criar_tarefa. Por ora, os
-- templates são estrutura-morta (dormentes) pra demonstrar design.
-- =====================================================================

-- Welcome Trips org_id
WITH org_trips AS (
  SELECT 'b0000000-0000-0000-0000-000000000001'::UUID AS id
),

-- Template 1: Publicar app pós-aceite (dia 0)
t1 AS (
  INSERT INTO cadence_templates (
    org_id, name, description, target_audience, is_active,
    schedule_mode, require_completion_for_next, respect_business_hours
  ) SELECT org_trips.id,
    'Concierge: Publicar app pós-aceite',
    'Tarefa operacional: publicar a viagem no app do cliente.',
    'posvenda',
    false,
    'interval',
    false,
    true
  FROM org_trips
  WHERE NOT EXISTS (
    SELECT 1 FROM cadence_templates ct
    WHERE ct.org_id = org_trips.id AND ct.name = 'Concierge: Publicar app pós-aceite'
  )
  RETURNING id, org_id
),

-- Passo 1.1: task step (gera atendimento concierge)
s1 AS (
  INSERT INTO cadence_steps (
    template_id, org_id, step_order, step_key, step_type,
    task_config, day_offset, due_offset,
    gera_atendimento_concierge, tipo_concierge, categoria_concierge,
    condicao_extra
  ) SELECT
    t1.id, t1.org_id, 1, 'publicar_app', 'task',
    jsonb_build_object(
      'tipo', 'tarefa',
      'titulo', 'Publicar viagem no app',
      'descricao', 'Viagem aceita — publicar no app do cliente',
      'prioridade', 'media',
      'assign_to', 'specific',
      'assign_to_user_id', NULL
    ),
    0, -- day_offset: hoje (D+0)
    jsonb_build_object('unit', 'business_days', 'value', 0, 'anchor', 'cadence_start'),
    true, -- gera_atendimento_concierge
    'operacional',
    'publicar_app',
    '{}'::jsonb
  FROM t1
  RETURNING id
),

-- Template 2: Pedir passaporte D-20
t2 AS (
  INSERT INTO cadence_templates (
    org_id, name, description, target_audience, is_active,
    schedule_mode, require_completion_for_next, respect_business_hours
  ) SELECT org_trips.id,
    'Concierge: Pedir passaporte D-20',
    'Solicitação de documento: passaporte para embarque.',
    'posvenda',
    false,
    'interval',
    false,
    true
  FROM org_trips
  WHERE NOT EXISTS (
    SELECT 1 FROM cadence_templates ct
    WHERE ct.org_id = org_trips.id AND ct.name = 'Concierge: Pedir passaporte D-20'
  )
  RETURNING id, org_id
),

s2 AS (
  INSERT INTO cadence_steps (
    template_id, org_id, step_order, step_key, step_type,
    task_config, day_offset, due_offset,
    gera_atendimento_concierge, tipo_concierge, categoria_concierge,
    condicao_extra
  ) SELECT
    t2.id, t2.org_id, 1, 'pedir_passaporte', 'task',
    jsonb_build_object(
      'tipo', 'tarefa',
      'titulo', 'Pedir passaporte do viajante',
      'descricao', 'Solicitar cópia do passaporte (20 dias antes embarque)',
      'prioridade', 'alta',
      'assign_to', 'specific',
      'assign_to_user_id', NULL
    ),
    -20, -- D-20
    jsonb_build_object('unit', 'calendar_days', 'value', -20, 'anchor', 'trip_start'),
    true,
    'operacional',
    'passaporte',
    '{}'::jsonb
  FROM t2
  RETURNING id
),

-- Template 3: Oferecer check-in D-20
t3 AS (
  INSERT INTO cadence_templates (
    org_id, name, description, target_audience, is_active,
    schedule_mode, require_completion_for_next, respect_business_hours
  ) SELECT org_trips.id,
    'Concierge: Oferecer check-in D-20',
    'Oferta de serviço: fazer check-in antecipado do cliente.',
    'posvenda',
    false,
    'interval',
    false,
    true
  FROM org_trips
  WHERE NOT EXISTS (
    SELECT 1 FROM cadence_templates ct
    WHERE ct.org_id = org_trips.id AND ct.name = 'Concierge: Oferecer check-in D-20'
  )
  RETURNING id, org_id
),

s3 AS (
  INSERT INTO cadence_steps (
    template_id, org_id, step_order, step_key, step_type,
    task_config, day_offset, due_offset,
    gera_atendimento_concierge, tipo_concierge, categoria_concierge,
    condicao_extra
  ) SELECT
    t3.id, t3.org_id, 1, 'oferta_check_in', 'task',
    jsonb_build_object(
      'tipo', 'tarefa',
      'titulo', 'Oferecer check-in antecipado',
      'descricao', 'Contatar cliente e oferecer serviço de check-in',
      'prioridade', 'media',
      'assign_to', 'specific',
      'assign_to_user_id', NULL
    ),
    -20,
    jsonb_build_object('unit', 'calendar_days', 'value', -20, 'anchor', 'trip_start'),
    true,
    'oferta',
    'check_in_oferta',
    '{}'::jsonb
  FROM t3
  RETURNING id
),

-- Template 4: Welcome letter D-7
t4 AS (
  INSERT INTO cadence_templates (
    org_id, name, description, target_audience, is_active,
    schedule_mode, require_completion_for_next, respect_business_hours
  ) SELECT org_trips.id,
    'Concierge: Welcome letter D-7',
    'Envio de documento: carta de boas-vindas 7 dias antes embarque.',
    'posvenda',
    false,
    'interval',
    false,
    true
  FROM org_trips
  WHERE NOT EXISTS (
    SELECT 1 FROM cadence_templates ct
    WHERE ct.org_id = org_trips.id AND ct.name = 'Concierge: Welcome letter D-7'
  )
  RETURNING id, org_id
),

s4 AS (
  INSERT INTO cadence_steps (
    template_id, org_id, step_order, step_key, step_type,
    task_config, day_offset, due_offset,
    gera_atendimento_concierge, tipo_concierge, categoria_concierge,
    condicao_extra
  ) SELECT
    t4.id, t4.org_id, 1, 'welcome_letter', 'task',
    jsonb_build_object(
      'tipo', 'tarefa',
      'titulo', 'Enviar welcome letter',
      'descricao', 'Preparar e enviar carta de boas-vindas',
      'prioridade', 'media',
      'assign_to', 'specific',
      'assign_to_user_id', NULL
    ),
    -7,
    jsonb_build_object('unit', 'calendar_days', 'value', -7, 'anchor', 'trip_start'),
    true,
    'operacional',
    'welcome_letter',
    '{}'::jsonb
  FROM t4
  RETURNING id
),

-- Template 5: Executar check-in D-2
t5 AS (
  INSERT INTO cadence_templates (
    org_id, name, description, target_audience, is_active,
    schedule_mode, require_completion_for_next, respect_business_hours
  ) SELECT org_trips.id,
    'Concierge: Executar check-in D-2',
    'Ação de concierge: fazer check-in do cliente 2 dias antes embarque.',
    'posvenda',
    false,
    'interval',
    false,
    true
  FROM org_trips
  WHERE NOT EXISTS (
    SELECT 1 FROM cadence_templates ct
    WHERE ct.org_id = org_trips.id AND ct.name = 'Concierge: Executar check-in D-2'
  )
  RETURNING id, org_id
),

s5 AS (
  INSERT INTO cadence_steps (
    template_id, org_id, step_order, step_key, step_type,
    task_config, day_offset, due_offset,
    gera_atendimento_concierge, tipo_concierge, categoria_concierge,
    condicao_extra
  ) SELECT
    t5.id, t5.org_id, 1, 'executar_check_in', 'task',
    jsonb_build_object(
      'tipo', 'tarefa',
      'titulo', 'Fazer check-in online',
      'descricao', 'Efetuar check-in online no sistema da aérea',
      'prioridade', 'alta',
      'assign_to', 'specific',
      'assign_to_user_id', NULL
    ),
    -2,
    jsonb_build_object('unit', 'calendar_days', 'value', -2, 'anchor', 'trip_start'),
    true,
    'operacional',
    'check_in_executar',
    '{}'::jsonb
  FROM t5
  RETURNING id
),

-- Template 6: Pesquisa pós D+3
t6 AS (
  INSERT INTO cadence_templates (
    org_id, name, description, target_audience, is_active,
    schedule_mode, require_completion_for_next, respect_business_hours
  ) SELECT org_trips.id,
    'Concierge: Pesquisa pós D+3',
    'Pesquisa de satisfação 3 dias após término da viagem.',
    'posvenda',
    false,
    'interval',
    false,
    true
  FROM org_trips
  WHERE NOT EXISTS (
    SELECT 1 FROM cadence_templates ct
    WHERE ct.org_id = org_trips.id AND ct.name = 'Concierge: Pesquisa pós D+3'
  )
  RETURNING id, org_id
),

s6 AS (
  INSERT INTO cadence_steps (
    template_id, org_id, step_order, step_key, step_type,
    task_config, day_offset, due_offset,
    gera_atendimento_concierge, tipo_concierge, categoria_concierge,
    condicao_extra
  ) SELECT
    t6.id, t6.org_id, 1, 'pesquisa_pos', 'task',
    jsonb_build_object(
      'tipo', 'tarefa',
      'titulo', 'Enviar pesquisa pós-viagem',
      'descricao', 'Solicitar feedback do cliente sobre sua viagem',
      'prioridade', 'baixa',
      'assign_to', 'specific',
      'assign_to_user_id', NULL
    ),
    3,
    jsonb_build_object('unit', 'calendar_days', 'value', 3, 'anchor', 'trip_end'),
    true,
    'operacional',
    'pesquisa_pos',
    '{}'::jsonb
  FROM t6
  RETURNING id
),

-- Template 7: Tratamento VIP D-30 (condicional)
t7 AS (
  INSERT INTO cadence_templates (
    org_id, name, description, target_audience, is_active,
    schedule_mode, require_completion_for_next, respect_business_hours
  ) SELECT org_trips.id,
    'Concierge: Tratamento VIP D-30 (condicional)',
    'Preparação especial para clientes VIP 30 dias antes embarque.',
    'posvenda',
    false,
    'interval',
    false,
    true
  FROM org_trips
  WHERE NOT EXISTS (
    SELECT 1 FROM cadence_templates ct
    WHERE ct.org_id = org_trips.id AND ct.name = 'Concierge: Tratamento VIP D-30 (condicional)'
  )
  RETURNING id, org_id
),

s7 AS (
  INSERT INTO cadence_steps (
    template_id, org_id, step_order, step_key, step_type,
    task_config, day_offset, due_offset,
    gera_atendimento_concierge, tipo_concierge, categoria_concierge,
    condicao_extra
  ) SELECT
    t7.id, t7.org_id, 1, 'vip_treatment', 'task',
    jsonb_build_object(
      'tipo', 'tarefa',
      'titulo', 'Ativar tratamento VIP',
      'descricao', 'Preparar experiência customizada para cliente VIP',
      'prioridade', 'media',
      'assign_to', 'specific',
      'assign_to_user_id', NULL
    ),
    -30,
    jsonb_build_object('unit', 'calendar_days', 'value', -30, 'anchor', 'trip_start'),
    true,
    'operacional',
    'vip_treatment',
    jsonb_build_object('requer_ocasiao_especial', true)
  FROM t7
  RETURNING id
)

SELECT 'Seed concluído: 7 templates + 7 steps' AS resultado;
