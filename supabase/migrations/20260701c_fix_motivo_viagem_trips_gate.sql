-- 20260701c_fix_motivo_viagem_trips_gate.sql
--
-- Contexto: em 01/07 foi criado no funil TRIPS (org b0000000-...-001) o campo custom
-- 'motivo_da_viagem' ("Motivo da Viagem") e marcado como obrigatorio+bloqueante para
-- avancar cards. A configuracao ficou quebrada de duas formas e travou o funil inteiro:
--   1. TYPO: 7 etapas iniciais tem stage_field_config apontando para 'motivo_da_viamge'
--      (grafia errada). Nao existe system_field com essa chave -> o campo nunca renderiza
--      nem pode ser preenchido -> o quality gate bloqueia a entrada permanentemente.
--   2. DEADLOCK: a chave correta 'motivo_da_viagem' e obrigatoria+bloqueante nas 2 etapas
--      de ordem 5 (Apresentacao Feita 9b7cbc70, Reservas e Fechamento c81c09a0), mas so e
--      is_visible=true nessas mesmas etapas. Como o gate bloqueia a ENTRADA e o modal nao
--      deixa preencher inline, nao ha como satisfazer antes de mover.
-- Efeito: cards nao avancam -> a cadencia de taxa (dispara ao entrar em 'Apresentacao
--      Feita') nao roda -> atraso na 1a mensagem de taxa ao lead.
--
-- Decisao (Mateus): remover a trava de todas as etapas. Os cards voltam a andar. O campo
-- 'Motivo da Viagem' permanece VISIVEL nas 2 etapas de ordem 5 (disponivel pra preencher),
-- mas nao bloqueia mais.
--
-- Escopo: org TRIPS (b0000000-...-001). Idempotente.

DO $$
DECLARE
  v_trips_org UUID := 'b0000000-0000-0000-0000-000000000001';
BEGIN
  -- 1. Apaga as linhas com typo (campo inexistente 'motivo_da_viamge') -- 7 linhas
  DELETE FROM public.stage_field_config
   WHERE org_id = v_trips_org
     AND field_key = 'motivo_da_viamge';

  -- 2. Mantem o campo correto VISIVEL, mas sem obrigar/bloquear -- 2 linhas (ordem 5)
  UPDATE public.stage_field_config
     SET is_required = false, is_blocking = false
   WHERE org_id = v_trips_org
     AND field_key = 'motivo_da_viagem';
END $$;

-- Verificacao: deve ser 0
DO $$
DECLARE v_bloqueios INT;
BEGIN
  SELECT count(*) INTO v_bloqueios
    FROM public.stage_field_config
   WHERE org_id = 'b0000000-0000-0000-0000-000000000001'
     AND field_key IN ('motivo_da_viamge','motivo_da_viagem')
     AND (is_required = true OR is_blocking = true);
  IF v_bloqueios > 0 THEN
    RAISE EXCEPTION 'Ainda ha % trava(s) de Motivo da Viagem no TRIPS', v_bloqueios;
  END IF;
END $$;
