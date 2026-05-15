// Helper temporário pra acessar a tabela `wedding_guests` enquanto ela ainda
// não foi adicionada ao `database.types.ts`. Após `npx supabase gen types
// typescript --project-id szyrzxvlptqqheizyrxu > src/database.types.ts`,
// remover este helper e usar `supabase` diretamente.

import { supabase } from '../../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sbAny: any = supabase
