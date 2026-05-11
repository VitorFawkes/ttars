// Helper temporário pra acessar tabelas/views/RPCs ainda não tipadas
// no database.types.ts (atendimentos_concierge, v_meu_dia_concierge,
// v_atendimentos_lote, v_card_concierge_stats, rpc_*).
//
// Após rodar `npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu
// > src/database.types.ts` e remover este helper, atualize os imports nos hooks
// concierge pra usar `supabase` diretamente com tipos.

import { supabase } from '../../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sbAny: any = supabase
