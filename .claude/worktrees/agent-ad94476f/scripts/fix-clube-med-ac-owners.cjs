/**
 * Script one-time: Corrigir owners dos deals Club Med no ActiveCampaign
 * e sincronizar dados completos dos contatos (nome, email, CPF, etc.)
 *
 * Uso: source .env && node scripts/fix-clube-med-ac-owners.cjs
 */

const https = require('https');

// ── Config ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let AC_API_URL = '';
let AC_API_KEY = '';

// AC custom field IDs for contacts
const AC_FIELD_CPF = '129';
const AC_FIELD_BIRTHDATE = '37';
const AC_FIELD_GENDER = '33';
const AC_FIELD_WHATSAPP = '160';

// Tag para filtrar cards Club Med
const CLUBE_MED_TAG_ID = '55f599ca-cf17-4f25-8210-109b4e4a4d87';

// ── HTTP helpers ────────────────────────────────────────────────────────
function fetchJSON(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const reqOptions = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        if (options.body) req.write(JSON.stringify(options.body));
        req.end();
    });
}

function supabaseGet(path) {
    return fetchJSON(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    });
}

function acGet(path) {
    return fetchJSON(`${AC_API_URL}${path}`, {
        headers: { 'Api-Token': AC_API_KEY },
    });
}

function acPut(path, body) {
    return fetchJSON(`${AC_API_URL}${path}`, {
        method: 'PUT',
        headers: { 'Api-Token': AC_API_KEY },
        body,
    });
}

function acPost(path, body) {
    return fetchJSON(`${AC_API_URL}${path}`, {
        method: 'POST',
        headers: { 'Api-Token': AC_API_KEY },
        body,
    });
}

// Rate limit: ~5 req/sec to avoid AC throttling
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
    // Validate env
    if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
        console.error('Missing env vars. Run: source .env');
        process.exit(1);
    }

    console.log('=== Fix Club Med AC Owners + Contact Sync ===\n');

    // Load AC credentials from integration_settings table
    console.log('0. Carregando credenciais AC do banco...');
    const { data: acSettings } = await supabaseGet(
        'integration_settings?key=in.(ACTIVECAMPAIGN_API_KEY,ACTIVECAMPAIGN_API_URL)&select=key,value'
    );
    for (const s of acSettings) {
        if (s.key === 'ACTIVECAMPAIGN_API_URL') AC_API_URL = s.value;
        if (s.key === 'ACTIVECAMPAIGN_API_KEY') AC_API_KEY = s.value;
    }
    if (!AC_API_URL || !AC_API_KEY) {
        console.error('AC credentials not found in integration_settings');
        process.exit(1);
    }
    console.log(`   AC URL: ${AC_API_URL}`);

    // 1. Get owner mapping (CRM → AC)
    console.log('1. Buscando mapeamento de owners (integration_user_map)...');
    const { data: userMaps } = await supabaseGet(
        'integration_user_map?integration_id=eq.a2141b92-561f-4514-92b4-9412a068d236&select=internal_user_id,external_user_id'
    );
    const ownerMap = {};
    for (const m of userMaps) {
        ownerMap[m.internal_user_id] = m.external_user_id;
    }
    console.log(`   ${Object.keys(ownerMap).length} mappings encontrados`);

    // 2. Get all Club Med cards from CRM (with external_id = AC deal ID)
    console.log('2. Buscando cards Club Med do CRM...');
    const { data: cards } = await supabaseGet(
        'cards?titulo=ilike.*Club%20Med*&select=id,titulo,vendas_owner_id,dono_atual_id,external_id,pessoa_principal_id&limit=300'
    );
    console.log(`   ${cards.length} cards encontrados`);

    // Filter only cards with external_id (already synced to AC)
    const cardsWithAC = cards.filter((c) => c.external_id);
    console.log(`   ${cardsWithAC.length} com external_id (deal AC)`);

    // 3. Get all contatos in one batch
    console.log('3. Buscando contatos...');
    const contactIds = [...new Set(cardsWithAC.map((c) => c.pessoa_principal_id).filter(Boolean))];
    const contactMap = {};

    // Batch in groups of 50
    for (let i = 0; i < contactIds.length; i += 50) {
        const batch = contactIds.slice(i, i + 50);
        const ids = batch.join(',');
        const { data: contatos } = await supabaseGet(
            `contatos?id=in.(${ids})&select=id,nome,sobrenome,email,telefone,cpf_normalizado,sexo,data_nascimento`
        );
        for (const c of contatos) {
            contactMap[c.id] = c;
        }
    }
    console.log(`   ${Object.keys(contactMap).length} contatos carregados`);

    // 4. Process each card
    console.log('\n4. Processando deals no AC...\n');

    let ownerUpdated = 0;
    let ownerSkipped = 0;
    let ownerFailed = 0;
    let contactSynced = 0;
    let contactFailed = 0;
    let noMapping = 0;

    for (let i = 0; i < cardsWithAC.length; i++) {
        const card = cardsWithAC[i];
        const dealId = card.external_id;
        const ownerId = card.vendas_owner_id;
        const acOwnerId = ownerMap[ownerId];
        const contato = contactMap[card.pessoa_principal_id];

        const label = `[${i + 1}/${cardsWithAC.length}] ${card.titulo} (deal ${dealId})`;

        if (!acOwnerId) {
            console.log(`${label} — SEM MAPPING para owner ${ownerId?.substring(0, 8)}`);
            noMapping++;
            continue;
        }

        // 4a. Update deal owner
        try {
            const { status, data } = await acPut(`/api/3/deals/${dealId}`, {
                deal: { owner: acOwnerId },
            });

            if (status >= 200 && status < 300) {
                const currentOwner = data?.deal?.owner;
                if (String(currentOwner) === String(acOwnerId)) {
                    ownerUpdated++;
                } else {
                    console.log(`${label} — Owner update retornou ${currentOwner} (esperado ${acOwnerId})`);
                    ownerFailed++;
                }
            } else {
                console.log(`${label} — FALHA owner update: HTTP ${status}`);
                ownerFailed++;
            }
        } catch (err) {
            console.log(`${label} — ERRO owner: ${err.message}`);
            ownerFailed++;
        }

        await sleep(200); // rate limit

        // 4b. Sync contact data
        if (contato?.email) {
            try {
                const fieldValues = [];
                if (contato.cpf_normalizado) {
                    fieldValues.push({ field: AC_FIELD_CPF, value: contato.cpf_normalizado });
                }
                if (contato.data_nascimento) {
                    fieldValues.push({ field: AC_FIELD_BIRTHDATE, value: contato.data_nascimento });
                }
                if (contato.sexo) {
                    fieldValues.push({ field: AC_FIELD_GENDER, value: contato.sexo });
                }
                if (contato.telefone) {
                    fieldValues.push({ field: AC_FIELD_WHATSAPP, value: contato.telefone });
                }

                const contactBody = {
                    contact: {
                        email: contato.email,
                        firstName: contato.nome || '',
                        lastName: contato.sobrenome || '',
                        phone: contato.telefone || '',
                        fieldValues,
                    },
                };

                const { status } = await acPost('/api/3/contact/sync', contactBody);
                if (status >= 200 && status < 300) {
                    contactSynced++;
                } else {
                    console.log(`${label} — FALHA contact sync: HTTP ${status}`);
                    contactFailed++;
                }
            } catch (err) {
                console.log(`${label} — ERRO contact: ${err.message}`);
                contactFailed++;
            }
        }

        await sleep(200); // rate limit

        // Progress every 20
        if ((i + 1) % 20 === 0) {
            console.log(`   ... ${i + 1}/${cardsWithAC.length} processados`);
        }
    }

    // 5. Summary
    console.log('\n=== RESUMO ===');
    console.log(`Total deals processados: ${cardsWithAC.length}`);
    console.log(`Owners atualizados: ${ownerUpdated}`);
    console.log(`Owners skipped (sem mapping): ${noMapping}`);
    console.log(`Owners falharam: ${ownerFailed}`);
    console.log(`Contatos sincronizados: ${contactSynced}`);
    console.log(`Contatos falharam: ${contactFailed}`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
