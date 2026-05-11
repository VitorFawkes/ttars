#!/usr/bin/env node
/**
 * Backfill produto_data.orcamento (smart_budget format) from valor_estimado
 *
 * Cards that have valor_estimado > 0 but no produto_data.orcamento
 * need the smart_budget JSON populated so the "Investimento" section field shows correctly.
 *
 * Usage: source .env && node scripts/backfill-orcamento-smart-budget.js [--dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';
    const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_KEY || !SERVICE_ROLE) {
        console.error('Missing env vars. Run: source .env');
        process.exit(1);
    }

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    };

    // 1. Get all open cards with valor_estimado > 0
    console.log('1. Fetching cards with valor_estimado > 0...');
    const cardsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/cards?select=id,titulo,valor_estimado,produto_data,status_comercial` +
        `&status_comercial=eq.aberto&valor_estimado=gt.0&order=valor_estimado.desc&limit=1000`,
        { headers }
    );
    const cards = await cardsRes.json();
    console.log(`   Found ${cards.length} open cards with valor_estimado > 0`);

    // 2. Filter cards that need backfill (no orcamento in produto_data)
    const needsBackfill = cards.filter(card => {
        const pd = card.produto_data || {};
        const orc = pd.orcamento;
        // Skip if already has smart_budget format
        return !orc || !orc.tipo;
    });
    console.log(`   ${needsBackfill.length} need orcamento backfill (${cards.length - needsBackfill.length} already have it)\n`);

    if (needsBackfill.length === 0) {
        console.log('Nothing to backfill.');
        return;
    }

    let fixed = 0;
    let errors = 0;

    for (const card of needsBackfill) {
        const val = card.valor_estimado;
        const orcamento = {
            tipo: 'total',
            valor: val,
            total_calculado: val,
            display: `R$ ${val.toLocaleString('pt-BR')}`
        };

        // Merge with existing produto_data (preserve other fields)
        const existingPD = card.produto_data || {};
        const newPD = { ...existingPD, orcamento };

        console.log(`[FIX] ${card.titulo?.substring(0, 50)} | R$${val.toLocaleString('pt-BR')} → orcamento.total`);

        if (!DRY_RUN) {
            const updateRes = await fetch(
                `${SUPABASE_URL}/rest/v1/cards?id=eq.${card.id}`,
                {
                    method: 'PATCH',
                    headers: { ...headers, 'Prefer': 'return=minimal' },
                    body: JSON.stringify({ produto_data: newPD })
                }
            );
            if (!updateRes.ok) {
                const err = await updateRes.text();
                console.error(`  [ERR] Failed: ${err}`);
                errors++;
                continue;
            }
        }
        fixed++;
    }

    console.log('\n=== Summary ===');
    console.log(`Backfilled: ${fixed}`);
    console.log(`Errors:     ${errors}`);
    console.log(`Total:      ${needsBackfill.length}`);
    if (DRY_RUN) console.log('\n⚠️  DRY RUN - no changes. Remove --dry-run to apply.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
