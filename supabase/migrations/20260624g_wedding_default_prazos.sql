-- Tarefas-padrão SEM prazo = cobrança 🔁 e Meu Dia DORMENTES (auditoria 24/06):
-- 17 das 22 tarefas-padrão tinham dias_prazo NULL → wedding_checklist.prazo NULL
-- → o cron de cobrança (WHERE prazo < CURRENT_DATE) nunca casava → 0 cobranças.
--
-- Preenche dias_prazo (dias desde a ENTRADA no planejamento) com uma 1ª versão
-- sensata modelando a jornada de ~45 dias por etapa (E1≈0-5d … E6≈35-45d).
-- A Diana ajusta no editor do Studio (é dela a decisão final). NÃO mexe nas 5
-- que já tinham prazo. Só os DEFAULTS → vale pra casamentos NOVOS; os 115
-- existentes só ganham prazo num backfill controlado à parte (evita avalanche
-- de cobranças vencidas de uma vez).

BEGIN;

UPDATE public.wedding_stage_default_tasks d
   SET dias_prazo = v.dias
  FROM (VALUES
    -- E2 Onboarding
    ('Realizar a 1ª reunião',                          8),
    ('Mostrar ao casal as datas/prazos do planejamento', 8),
    ('Casal começa a lista de convidados',             12),
    -- E3 Ciclo de Definição
    ('Definir o destino',                              15),
    ('Definir o local da cerimônia',                   18),
    ('Definir a data do casamento',                    18),
    ('Reuniões de ajuste',                             16),
    -- E4 Reserva do Evento & Documentação
    ('Fazer a reserva da cerimônia/espaço',            24),
    ('Enviar a documentação ao casal',                 22),
    ('Receber o contrato do casamento assinado',       28),
    ('Receber o sinal',                                28),
    -- E5 Bloqueio de Hospedagem & Ação Promocional
    ('Casal definir o nº de apartamentos a bloquear',  30),
    ('Fechar o bloqueio com o hotel',                  33),
    ('Definir a ação promocional',                     35),
    -- E6 Programação Final
    ('Montar a programação dia a dia',                 40),
    ('Garantir a lista de convidados preenchida',      42),
    ('Revisar tudo + marcar "Pronto para Produção"',   44)
  ) AS v(titulo, dias)
 WHERE d.titulo = v.titulo
   AND d.org_id = 'b0000000-0000-0000-0000-000000000002'
   AND d.dias_prazo IS NULL;

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_null INT;
BEGIN
  SELECT count(*) INTO v_null
    FROM public.wedding_stage_default_tasks
   WHERE org_id = 'b0000000-0000-0000-0000-000000000002' AND dias_prazo IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'ainda há % tarefa-padrão WEDDING sem dias_prazo', v_null;
  END IF;
  RAISE NOTICE 'tarefas-padrão WEDDING: todas com dias_prazo (cobrança/Meu Dia podem agir em casamentos novos)';
END $$;
