-- ═══════════════════════════════════════════════════════════════════════════
-- Weddings: ativar o campo de data da reunião do Closer (paridade com o do SDR)
-- ═══════════════════════════════════════════════════════════════════════════
-- O campo ww_closer_data_reuniao já existe em system_fields, mas está INATIVO,
-- type='date' (sem hora) e na seção errada (wedding_info). Para exibir a data da
-- reunião do Closer com hora, na seção do Closer — igual ao ww_sdr_data_reuniao
-- (datetime, ativo, wedding_sdr) — ativamos e corrigimos type/seção.
-- O Calendly do Closer grava essa chave em produto_data via meeting_date_target.
-- Org Weddings: b0000000-0000-0000-0000-000000000002.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.system_fields
SET active  = true,
    type    = 'datetime',
    section = 'wedding_closer'
WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
  AND key    = 'ww_closer_data_reuniao';
