#!/usr/bin/env node
/**
 * Verifica se o card foi atualizado pelo workflow
 */

const CARD_ID = process.argv[2] || '9e5e2ec6-c7af-4d95-a915-4d0276921ff7';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://szyrzxvlptqqheizyrxu.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!ANON_KEY) {
  console.error('❌ SUPABASE_ANON_KEY is required');
  process.exit(1);
}

async function checkCard() {
  console.log(`🔍 Verificando card: ${CARD_ID}`);
  console.log('');

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cards?id=eq.${CARD_ID}&select=titulo,produto_data,briefing_inicial,pipeline_stages(fase)`,
      {
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const card = data[0];

    if (!card) {
      console.log('❌ Card não encontrado');
      return;
    }

    console.log(`📋 Título: ${card.titulo}`);
    console.log(`📊 Fase: ${card.pipeline_stages?.fase || 'N/A'}`);
    console.log('');
    console.log('═'.repeat(50));
    console.log('PRODUTO_DATA:');
    console.log('═'.repeat(50));
    console.log(JSON.stringify(card.produto_data, null, 2));
    console.log('');
    console.log('═'.repeat(50));
    console.log('BRIEFING_INICIAL:');
    console.log('═'.repeat(50));
    console.log(JSON.stringify(card.briefing_inicial, null, 2));

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkCard();
