/**
 * Script para criar o registro de integração AC na tabela integrations
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_ANON_KEY or VITE_SUPABASE_KEY is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fix() {
  console.log('\n🔧 CRIANDO REGISTRO DE INTEGRAÇÃO\n');

  // Verificar se já existe
  const { data: existing } = await supabase
    .from('integrations')
    .select('id')
    .eq('provider', 'active_campaign')
    .single();

  if (existing) {
    console.log('✅ Registro já existe:', existing.id);
    return;
  }

  // Criar novo registro
  const { data, error } = await supabase
    .from('integrations')
    .insert({
      provider: 'active_campaign',
      is_active: true,
      config: {
        name: 'ActiveCampaign',
        description: 'Integração com ActiveCampaign para sincronização de deals e contatos'
      }
    })
    .select()
    .single();

  if (error) {
    console.log('❌ Erro ao criar:', error.message);
    console.log('\n   Detalhes:', error);
    return;
  }

  console.log('✅ Registro criado com sucesso!');
  console.log('   ID:', data.id);
  console.log('   Provider:', data.provider);
  console.log('   Ativo:', data.is_active);

  console.log('\n📋 PRÓXIMOS PASSOS:\n');
  console.log('   1. Configure o mapeamento de stages em Admin > Integrações');
  console.log('   2. Configure o mapeamento de usuários (owners)');
  console.log('   3. Tente sincronizar novamente\n');
}

fix().catch(console.error);
