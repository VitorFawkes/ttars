#!/usr/bin/env node
/**
 * Fix historical card values from ActiveCampaign API
 *
 * Bug: parseFloat("10,000.00") = 10 (stops at comma)
 * AC webhooks send deal[value] formatted with commas.
 * This script fetches the correct value from AC API (in cents) and updates cards.
 *
 * Usage: source .env && node scripts/fix-card-values-from-ac.js [--dry-run]
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

    // 1. Get AC API credentials from integration_settings
    console.log('1. Fetching AC API credentials...');
    const settingsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/integration_settings?key=in.(ACTIVECAMPAIGN_API_KEY,ACTIVECAMPAIGN_API_URL)&select=key,value`,
        { headers }
    );
    const settings = await settingsRes.json();
    const acUrl = settings.find(s => s.key === 'ACTIVECAMPAIGN_API_URL')?.value;
    const acKey = settings.find(s => s.key === 'ACTIVECAMPAIGN_API_KEY')?.value;

    if (!acUrl || !acKey) {
        console.error('AC API credentials not found in integration_settings');
        process.exit(1);
    }
    console.log(`   AC API URL: ${acUrl}`);

    // 2. Get all open cards with suspiciously low values and AC external_id
    console.log('2. Fetching affected cards...');
    const cardsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/cards?select=id,titulo,valor_estimado,external_id,status_comercial` +
        `&status_comercial=eq.aberto&external_id=not.is.null&valor_estimado=gt.0&valor_estimado=lt.100` +
        `&order=valor_estimado.asc`,
        { headers }
    );
    const cards = await cardsRes.json();
    console.log(`   Found ${cards.length} cards with valor_estimado < 100`);

    if (cards.length === 0) {
        console.log('No cards to fix.');
        return;
    }

    // 3. For each card, fetch the deal value from AC API
    console.log('3. Fetching correct values from ActiveCampaign API...');
    const acHeaders = {
        'Api-Token': acKey,
        'Accept': 'application/json'
    };

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const card of cards) {
        const dealId = card.external_id;
        try {
            const dealRes = await fetch(`${acUrl}/api/3/deals/${dealId}`, { headers: acHeaders });

            if (!dealRes.ok) {
                console.log(`   [SKIP] Deal ${dealId} (${card.titulo?.substring(0, 40)}): AC API ${dealRes.status}`);
                skipped++;
                continue;
            }

            const dealData = await dealRes.json();
            const deal = dealData.deal;

            if (!deal || !deal.value) {
                console.log(`   [SKIP] Deal ${dealId}: no value in AC response`);
                skipped++;
                continue;
            }

            // AC API returns value in CENTS
            const acValueCents = parseInt(deal.value, 10);
            const correctValue = acValueCents / 100;

            if (correctValue === 0) {
                console.log(`   [SKIP] Deal ${dealId} (${card.titulo?.substring(0, 40)}): AC value is 0`);
                skipped++;
                continue;
            }

            if (correctValue === card.valor_estimado) {
                console.log(`   [OK]   Deal ${dealId}: already correct (${correctValue})`);
                skipped++;
                continue;
            }

            console.log(`   [FIX]  Deal ${dealId} | ${card.titulo?.substring(0, 40)} | R$${card.valor_estimado} → R$${correctValue.toLocaleString('pt-BR')}`);

            if (!DRY_RUN) {
                const updateRes = await fetch(
                    `${SUPABASE_URL}/rest/v1/cards?id=eq.${card.id}`,
                    {
                        method: 'PATCH',
                        headers: { ...headers, 'Prefer': 'return=minimal' },
                        body: JSON.stringify({ valor_estimado: correctValue })
                    }
                );
                if (!updateRes.ok) {
                    const err = await updateRes.text();
                    console.error(`   [ERR]  Failed to update card ${card.id}: ${err}`);
                    errors++;
                    continue;
                }
            }
            fixed++;

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 100));

        } catch (err) {
            console.error(`   [ERR]  Deal ${dealId}: ${err.message}`);
            errors++;
        }
    }

    console.log('\n=== Summary ===');
    console.log(`Fixed:   ${fixed}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors:  ${errors}`);
    console.log(`Total:   ${cards.length}`);
    if (DRY_RUN) console.log('\n⚠️  DRY RUN - no changes were made. Remove --dry-run to apply.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
