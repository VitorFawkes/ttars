// Script para executar migração do Sistema de Sub-Cards
// Usa a biblioteca pg para conectar diretamente ao Supabase

import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);

const { execSync } = require('child_process');

console.log('Verificando pg...');
try {
  require.resolve('pg');
  console.log('pg já instalado');
} catch (e) {
  console.log('Instalando pg...');
  execSync('npm install pg --no-save', { stdio: 'pipe' });
}

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is required');
  process.exit(1);
}

// Read the migration file
const migrationPath = new URL('../supabase/migrations/20260201700000_sub_cards_system.sql', import.meta.url);
const migration = readFileSync(migrationPath, 'utf8');

async function runMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('\n🚀 Conectando ao banco Supabase...');
    await client.connect();
    console.log('✅ Conectado!\n');

    console.log('📦 Executando migração do Sistema Sub-Cards...\n');
    console.log('Esta migração irá:');
    console.log('  - Adicionar colunas card_type, sub_card_mode, sub_card_status, etc na tabela cards');
    console.log('  - Criar tabela sub_card_sync_log');
    console.log('  - Criar RPCs: criar_sub_card, merge_sub_card, cancelar_sub_card, get_sub_cards');
    console.log('  - Criar trigger para auto-cancelar sub-cards quando pai é perdido');
    console.log('  - Atualizar view_cards_acoes com campos de sub-cards\n');

    await client.query(migration);

    console.log('\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');

    // Verification
    console.log('🔍 Verificando migração...\n');

    // Check columns
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'cards'
        AND column_name IN ('card_type', 'sub_card_mode', 'sub_card_status', 'merged_at', 'merged_by', 'merge_metadata')
      ORDER BY column_name
    `);
    console.log('Novas colunas em cards:');
    console.table(columns.rows);

    // Check table
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sub_card_sync_log'
      ) as exists
    `);
    console.log(`Tabela sub_card_sync_log: ${tableExists.rows[0].exists ? '✅ Criada' : '❌ Não encontrada'}`);

    // Check functions
    const functions = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN ('criar_sub_card', 'merge_sub_card', 'cancelar_sub_card', 'get_sub_cards')
      ORDER BY routine_name
    `);
    console.log('\nFunções RPC criadas:');
    functions.rows.forEach(f => console.log(`  ✅ ${f.routine_name}`));

    // Check view columns
    const viewColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'view_cards_acoes'
        AND column_name IN ('card_type', 'sub_card_mode', 'sub_card_status', 'active_sub_cards_count', 'parent_card_title')
    `);
    console.log('\nColunas adicionadas à view_cards_acoes:');
    viewColumns.rows.forEach(c => console.log(`  ✅ ${c.column_name}`));

    console.log('\n🎉 Sistema de Sub-Cards pronto para uso!');

  } catch (err) {
    console.error('\n❌ Erro ao executar migração:', err.message);
    if (err.detail) console.error('Detalhe:', err.detail);
    if (err.hint) console.error('Dica:', err.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
