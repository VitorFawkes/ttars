#!/usr/bin/env node
/**
 * Import Club Med 2026 — Cria cards para ~180 contatos na etapa "Oportunidade"
 *
 * Uso: source .env && node scripts/import-clube-med.js
 *
 * Dados: 2 CSVs em Club Med/
 * - Lista Top Clientes (91 contatos, potenciais compradores >40K)
 * - Prioridade Mensagem (127 contatos, já compraram Club Med)
 *
 * Cada contato ganha 1 card novo (mesmo se já tiver card ativo).
 * Título: "{Primeiro Nome} / Club Med"
 * Tag: "Club Med 2026"
 */

const fs = require('fs');
const path = require('path');

// ── Load .env ───────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PIPELINE_ID = 'c8022522-4a1d-411c-9387-efe03ca725ee'; // TRIPS
const PRODUTO = 'TRIPS';
const TAG_NAME = 'Club Med 2026';
const TAG_COLOR = '#0891b2';
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Variáveis VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.');
  console.error('   Rode: source .env && node scripts/import-clube-med.js');
  process.exit(1);
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function supabaseGet(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${table} failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function supabasePost(table, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function supabaseRpc(fn, body) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${fn} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── CSV Parser (manual, handles quoted fields with commas/newlines) ─────────
function parseCSV(content) {
  const rows = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      current += ch; // preserve quotes for field parser
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === '\n' && !inQuotes) {
      rows.push(current);
      current = '';
    } else if (ch === '\r' && !inQuotes) {
      // skip \r
    } else {
      current += ch;
    }
  }
  if (current.trim()) rows.push(current);

  return rows.map(row => {
    const fields = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQ && row[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === ',' && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  });
}

// ── Read & unify CSVs ──────────────────────────────────────────────────────
function readCSVs() {
  const dir = path.join(__dirname, '..', 'Clube Med');

  // File 1: Lista Top Clientes (Pessoa, Telefone, E-mail, ..., Vendedor)
  const csv1 = fs.readFileSync(path.join(dir, 'Club Med - Mensagens Manuais - Lista Top Clientes.csv'), 'utf-8');
  const rows1 = parseCSV(csv1);
  const header1 = rows1[0];

  const contacts1 = [];
  for (let i = 1; i < rows1.length; i++) {
    const r = rows1[i];
    const nome = (r[0] || '').trim();
    const email = (r[2] || '').trim().toLowerCase().replace(/,+$/, ''); // fix trailing comma
    const telefone = (r[1] || '').trim();
    const vendedor = (r[4] || '').trim();
    if (!nome && !email) continue;
    contacts1.push({ nome, email, telefone, vendedor, source: 'top_clientes' });
  }

  // File 2: Prioridade Mensagem (Nome[vendedor], E-mail, Nome[contato], ..., Celular, ...)
  const csv2 = fs.readFileSync(path.join(dir, 'Club Med - Mensagens Manuais - Prioridade Mensagem.csv'), 'utf-8');
  const rows2 = parseCSV(csv2);

  const contacts2 = [];
  for (let i = 1; i < rows2.length; i++) {
    const r = rows2[i];
    const vendedor = (r[0] || '').trim();
    const email = (r[1] || '').trim().toLowerCase().replace(/,+$/, '');
    const nome = (r[2] || '').trim();
    const telefone = (r[6] || '').trim();
    if (!nome && !email) continue;
    contacts2.push({ nome, email, telefone, vendedor, source: 'prioridade' });
  }

  // Deduplicate by email (keep first occurrence, merge phone if missing)
  const byEmail = new Map();
  const noEmail = [];

  for (const c of [...contacts1, ...contacts2]) {
    if (!c.email) {
      noEmail.push(c);
      continue;
    }
    if (byEmail.has(c.email)) {
      const existing = byEmail.get(c.email);
      if (!existing.telefone && c.telefone) existing.telefone = c.telefone;
      if (!existing.vendedor && c.vendedor) existing.vendedor = c.vendedor;
    } else {
      byEmail.set(c.email, { ...c });
    }
  }

  // For no-email contacts, deduplicate by normalized name
  const noEmailDeduped = [];
  const seenNames = new Set();
  for (const c of noEmail) {
    const key = c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!seenNames.has(key)) {
      seenNames.add(key);
      noEmailDeduped.push(c);
    }
  }

  const all = [...byEmail.values(), ...noEmailDeduped];
  console.log(`📋 CSV: ${contacts1.length} do Top Clientes, ${contacts2.length} do Prioridade`);
  console.log(`📋 Após dedup: ${byEmail.size} com email + ${noEmailDeduped.length} sem email = ${all.length} total`);
  return all;
}

// ── Resolve vendedoras ─────────────────────────────────────────────────────
async function resolveVendedoras(contacts) {
  // Get unique vendedora names (normalize casing, filter out non-names)
  const KNOWN_NON_NAMES = ['compra acima de 40k', 'sim', 'não', 'alta', 'alta +', 'media', 'baixa'];
  const vendedoraNames = [...new Set(
    contacts
      .map(c => c.vendedor)
      .filter(Boolean)
      .filter(v => !KNOWN_NON_NAMES.includes(v.toLowerCase().trim()))
      .map(v => v.trim())
  )];

  // Normalize casing variants (e.g., "Camila montanhini seixas" → "Camila Montanhini Seixas")
  const normalizedMap = new Map(); // lowercase → original
  const uniqueVendedoras = [];
  for (const name of vendedoraNames) {
    const key = name.toLowerCase();
    if (!normalizedMap.has(key)) {
      normalizedMap.set(key, name);
      uniqueVendedoras.push(name);
    }
  }
  // Re-map contacts to use normalized vendedora names
  for (const c of contacts) {
    if (c.vendedor) {
      const key = c.vendedor.toLowerCase().trim();
      if (normalizedMap.has(key)) {
        c.vendedor = normalizedMap.get(key);
      }
    }
  }
  console.log(`\n👩‍💼 Vendedoras nos CSVs: ${uniqueVendedoras.join(', ')}`);

  // Fetch all active profiles
  const profiles = await supabaseGet('profiles', 'select=id,nome,email&active=is.true');

  const vendedoraMap = new Map(); // csvName → profile
  const notFound = [];

  for (const name of uniqueVendedoras) {
    // Strategy 1: Full substring match (case-insensitive)
    let match = profiles.find(p =>
      p.nome && p.nome.toLowerCase().includes(name.toLowerCase())
    );

    if (!match) {
      // Strategy 2: Word-by-word match (all words ≥ 3 chars must match)
      const words = name.split(/\s+/).filter(w => w.length >= 3);
      match = profiles.find(p => {
        if (!p.nome) return false;
        const pLower = p.nome.toLowerCase();
        return words.every(w => pLower.includes(w.toLowerCase()));
      });
    }

    if (!match) {
      // Strategy 3: First + Last name
      const parts = name.split(/\s+/);
      if (parts.length >= 2) {
        const first = parts[0].toLowerCase();
        const last = parts[parts.length - 1].toLowerCase();
        match = profiles.find(p => {
          if (!p.nome) return false;
          const pLower = p.nome.toLowerCase();
          return pLower.includes(first) && pLower.includes(last);
        });
      }
    }

    if (match) {
      vendedoraMap.set(name, match);
      console.log(`  ✅ "${name}" → ${match.nome} (${match.id.slice(0, 8)})`);
    } else {
      notFound.push(name);
      console.log(`  ❌ "${name}" → NÃO ENCONTRADA`);
    }
  }

  return { vendedoraMap, notFound };
}

// ── Find contact in CRM ────────────────────────────────────────────────────
async function findContact(c) {
  // Strategy 1: By email (most reliable)
  if (c.email) {
    const byEmail = await supabaseGet('contatos',
      `select=id,nome,email&email=ilike.${encodeURIComponent(c.email)}&limit=1`
    );
    if (byEmail.length > 0) return byEmail[0];
  }

  // Strategy 2: By phone (normalize to digits only)
  if (c.telefone) {
    const digits = c.telefone.replace(/\D/g, '');
    if (digits.length >= 10) {
      // Try last 11 digits (with DDD) or last 9 digits (without)
      const byPhone = await supabaseGet('contatos',
        `select=id,nome,email&telefone=like.*${digits.slice(-9)}*&limit=3`
      );
      if (byPhone.length === 1) return byPhone[0];
      // If multiple matches, try to narrow by name
      if (byPhone.length > 1 && c.nome) {
        const firstName = c.nome.split(/\s+/)[0].toLowerCase();
        const nameMatch = byPhone.find(p => p.nome && p.nome.toLowerCase().startsWith(firstName));
        if (nameMatch) return nameMatch;
        return byPhone[0]; // fallback to first
      }
    }
  }

  // Strategy 3: By exact name (case-insensitive)
  if (c.nome) {
    const byName = await supabaseGet('contatos',
      `select=id,nome,email&nome=ilike.${encodeURIComponent(c.nome)}&limit=3`
    );
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
      // Multiple name matches - log warning and use first
      console.log(`    ⚠️  Múltiplos contatos com nome "${c.nome}" — usando primeiro`);
      return byName[0];
    }

    // Strategy 4: First name + last name (partial match)
    const parts = c.nome.split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const byPartial = await supabaseGet('contatos',
        `select=id,nome,email&nome=ilike.${encodeURIComponent(first)}%25&nome=ilike.%25${encodeURIComponent(last)}&limit=3`
      );
      if (byPartial.length >= 1) {
        if (byPartial.length > 1) {
          console.log(`    ⚠️  Múltiplos contatos para "${first}...${last}" — usando primeiro`);
        }
        return byPartial[0];
      }
    }
  }

  return null;
}

// ── Get or create tag ──────────────────────────────────────────────────────
async function getOrCreateTag() {
  const existing = await supabaseGet('card_tags',
    `select=id,name&name=eq.${encodeURIComponent(TAG_NAME)}&limit=1`
  );
  if (existing.length > 0) {
    console.log(`🏷️  Tag "${TAG_NAME}" já existe (${existing[0].id.slice(0, 8)})`);
    return existing[0].id;
  }

  // Get admin user for created_by
  const admin = await supabaseGet('profiles',
    `select=id&email=eq.vitor@welcometrips.com.br&limit=1`
  );
  const createdBy = admin.length > 0 ? admin[0].id : null;

  const [tag] = await supabasePost('card_tags', {
    name: TAG_NAME,
    color: TAG_COLOR,
    description: 'Campanha Club Med 2026',
    produto: PRODUTO,
    is_active: true,
    created_by: createdBy,
  });
  console.log(`🏷️  Tag "${TAG_NAME}" criada (${tag.id.slice(0, 8)})`);
  return tag.id;
}

// ── Get "Oportunidade" stage ───────────────────────────────────────────────
async function getOportunidadeStage() {
  const stages = await supabaseGet('pipeline_stages',
    `select=id,nome&pipeline_id=eq.${PIPELINE_ID}&nome=eq.Oportunidade&limit=1`
  );
  if (stages.length === 0) {
    // Fallback: try "Briefing Agendado" (migration not applied yet?)
    const fallback = await supabaseGet('pipeline_stages',
      `select=id,nome&pipeline_id=eq.${PIPELINE_ID}&nome=eq.${encodeURIComponent('Briefing Agendado')}&limit=1`
    );
    if (fallback.length === 0) {
      throw new Error('Stage "Oportunidade" ou "Briefing Agendado" não encontrado!');
    }
    console.log(`⚠️  Stage ainda é "Briefing Agendado" — migration pendente?`);
    return fallback[0].id;
  }
  return stages[0].id;
}

// ── Create card ────────────────────────────────────────────────────────────
async function createCard(nomePessoa, contatoId, stageId, ownerId, tagId) {
  const firstName = nomePessoa.split(/\s+/)[0];
  // Capitalize first letter of each word
  const titulo = `${firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()} / Club Med`;

  const cardData = {
    titulo,
    produto: PRODUTO,
    pipeline_id: PIPELINE_ID,
    pipeline_stage_id: stageId,
    pessoa_principal_id: contatoId,
    vendas_owner_id: ownerId,
    dono_atual_id: ownerId,
    status_comercial: 'aberto',
    moeda: 'BRL',
  };

  if (DRY_RUN) {
    console.log(`    [DRY-RUN] Criaria: "${titulo}" → owner ${ownerId?.slice(0, 8) || 'NULL'}`);
    return { id: 'dry-run-' + Math.random().toString(36).slice(2) };
  }

  const [card] = await supabasePost('cards', cardData);

  // Assign tag
  try {
    await supabasePost('card_tag_assignments', {
      card_id: card.id,
      tag_id: tagId,
      assigned_by: ownerId,
    });
  } catch (err) {
    console.log(`    ⚠️  Tag assign falhou: ${err.message}`);
  }

  // Link contact to card via cards_contatos (M:N)
  try {
    await supabasePost('cards_contatos', {
      card_id: card.id,
      contato_id: contatoId,
    });
  } catch (err) {
    // May fail if trigger already creates the link via pessoa_principal_id
    // That's OK - ignore duplicate
  }

  return card;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  IMPORT CLUB MED 2026');
  console.log(DRY_RUN ? '  ⚠️  MODO DRY-RUN (nada será criado)' : '  🚀 MODO PRODUÇÃO');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Read CSVs
  const contacts = readCSVs();

  // 2. Resolve vendedoras
  const { vendedoraMap, notFound: vendedorasNotFound } = await resolveVendedoras(contacts);
  if (vendedorasNotFound.length > 0) {
    console.log(`\n⚠️  ${vendedorasNotFound.length} vendedoras não encontradas: ${vendedorasNotFound.join(', ')}`);
    console.log('   Cards dessas vendedoras serão criados SEM owner.');
  }

  // 3. Get or create tag
  const tagId = await getOrCreateTag();

  // 4. Get stage
  const stageId = await getOportunidadeStage();
  console.log(`\n📍 Stage: ${stageId.slice(0, 8)}`);

  // 5. Fetch existing Club Med cards to skip duplicates
  const existingCards = await supabaseGet('cards',
    `select=pessoa_principal_id&titulo=ilike.*Club+Med*&limit=500`
  );
  const existingContactIds = new Set(existingCards.map(c => c.pessoa_principal_id).filter(Boolean));
  console.log(`\n📋 ${existingContactIds.size} contatos já têm card Club Med — serão pulados`);

  // 6. Process each contact
  console.log(`\n🔄 Processando ${contacts.length} contatos...\n`);

  const results = { created: 0, skipped: 0, errors: 0, contactNotFound: 0, details: [] };

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const progress = `[${i + 1}/${contacts.length}]`;

    try {
      // Find contact in CRM
      const contato = await findContact(c);

      if (!contato) {
        console.log(`${progress} ❌ CONTATO NÃO ENCONTRADO: "${c.nome}" (${c.email || 'sem email'}, ${c.telefone || 'sem tel'})`);
        results.contactNotFound++;
        results.details.push({ nome: c.nome, email: c.email, telefone: c.telefone, error: 'Contato não encontrado no CRM' });
        continue;
      }

      // Skip if contact already has a Club Med card
      if (existingContactIds.has(contato.id)) {
        console.log(`${progress} ⏭️  SKIP "${c.nome}" — já tem card Club Med`);
        results.skipped++;
        continue;
      }

      // Use CRM name for card title if CSV name is empty
      const nomeParaTitulo = c.nome || contato.nome || 'Contato';

      // Resolve owner
      const profile = vendedoraMap.get(c.vendedor);
      const ownerId = profile?.id || null;

      // Create card
      const card = await createCard(nomeParaTitulo, contato.id, stageId, ownerId, tagId);

      const ownerLabel = profile ? profile.nome : '⚠️ sem owner';
      console.log(`${progress} ✅ "${c.nome}" → CRM: ${contato.nome} → Card: ${card.id.slice(0, 8)} (${ownerLabel})`);
      results.created++;

    } catch (err) {
      console.log(`${progress} ❌ ERRO "${c.nome}": ${err.message}`);
      results.errors++;
      results.details.push({ nome: c.nome, email: c.email, error: err.message });
    }

    // Small delay to avoid rate limiting
    if (i % 10 === 9) await new Promise(r => setTimeout(r, 200));
  }

  // 6. Report
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  RESULTADO');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ✅ Cards criados: ${results.created}`);
  console.log(`  ⏭️  Pulados (já existiam): ${results.skipped}`);
  console.log(`  ❌ Contatos não encontrados: ${results.contactNotFound}`);
  console.log(`  ❌ Erros: ${results.errors}`);
  console.log(`  📊 Total processados: ${contacts.length}`);

  if (results.details.length > 0) {
    console.log('\n  DETALHES DE FALHAS:');
    for (const d of results.details) {
      console.log(`    - ${d.nome} (${d.email || 'sem email'}): ${d.error}`);
    }
  }

  if (vendedorasNotFound.length > 0) {
    console.log('\n  VENDEDORAS NÃO ENCONTRADAS:');
    for (const v of vendedorasNotFound) {
      console.log(`    - ${v}`);
    }
  }

  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
