-- Drop das 3 RPCs órfãs da aba "Funil por Perfil" (removida em 2026-05-29).
-- Frontend já não referencia nenhuma delas (FunilPerfil.tsx deletada,
-- hooks useWwFunilSlot / useWwFunilConversao / useWwPerfilCompare removidos).
-- Verificado: nenhuma outra função SQL chama essas 3.

DROP FUNCTION IF EXISTS public.ww_funil_perfil_slot(text, text, timestamptz, timestamptz, uuid, text, text[], text[], text[], text[], text[], uuid[], integer, text[]);
DROP FUNCTION IF EXISTS public.ww_perfil_compare(timestamptz, timestamptz, uuid, integer);
DROP FUNCTION IF EXISTS public.ww_v2_funil_conversao(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], text[], uuid[]);
