#!/usr/bin/env node
/**
 * Cria (ou reaproveita) a webhook subscription no Calendly que aponta
 * para nossa edge function `calendly-webhook` em produção.
 *
 * Uso:
 *   CALENDLY_PAT=<seu_token> node scripts/calendly-create-subscription.js
 *
 * Opcional:
 *   CALENDLY_WEBHOOK_URL=<override>  # default: a edge function de produção
 *
 * O script:
 *  1. Lê o usuário atual via /users/me pra pegar a organization URI.
 *  2. Lista subscriptions já existentes da organização.
 *  3. Se já existe uma apontando pro mesmo URL → imprime info e sai.
 *  4. Senão cria nova com events: invitee.created, invitee.canceled.
 *  5. Imprime o `signing_key` retornado — copie pro Supabase secret CALENDLY_SIGNING_KEY.
 */

const PAT = process.env.CALENDLY_PAT;
const WEBHOOK_URL = process.env.CALENDLY_WEBHOOK_URL
  || 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/calendly-webhook';

if (!PAT) {
  console.error('ERRO: defina CALENDLY_PAT no env antes de rodar.');
  console.error('Exemplo: CALENDLY_PAT=eyJ... node scripts/calendly-create-subscription.js');
  process.exit(1);
}

const API = 'https://api.calendly.com';
const HEADERS = {
  Authorization: `Bearer ${PAT}`,
  'Content-Type': 'application/json',
};

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Calendly API ${res.status} on ${path}: ${text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

(async () => {
  console.log('1) Buscando usuário atual...');
  const me = await api('/users/me');
  const user = me.resource;
  console.log(`   user: ${user.name} <${user.email}>`);
  console.log(`   organization: ${user.current_organization}`);

  const orgUri = user.current_organization;
  const userUri = user.uri;

  console.log('\n2) Listando subscriptions existentes da organização...');
  const list = await api(`/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&scope=organization`);
  const subs = list.collection || [];
  const existing = subs.find((s) => s.callback_url === WEBHOOK_URL);

  if (existing) {
    console.log(`\n✓ Já existe uma subscription pra ${WEBHOOK_URL}:`);
    console.log(`  uri: ${existing.uri}`);
    console.log(`  state: ${existing.state}`);
    console.log(`  events: ${existing.events.join(', ')}`);
    console.log('\nSe quiser recriar, delete a antiga primeiro:');
    console.log(`  curl -X DELETE "${existing.uri}" -H "Authorization: Bearer $CALENDLY_PAT"`);
    console.log('\nObs: o signing_key NÃO é retornado de novo. Se você perdeu, precisa deletar e recriar.');
    return;
  }

  console.log('\n3) Criando subscription nova...');
  const body = {
    url: WEBHOOK_URL,
    events: ['invitee.created', 'invitee.canceled'],
    organization: orgUri,
    user: userUri,
    scope: 'organization',
  };
  const created = await api('/webhook_subscriptions', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  console.log('\n✓ Subscription criada:');
  console.log(`  uri: ${created.resource.uri}`);
  console.log(`  state: ${created.resource.state}`);
  console.log(`  events: ${created.resource.events.join(', ')}`);

  if (created.resource.signing_key) {
    console.log('\n🔑 SIGNING KEY (copie agora — só aparece uma vez):');
    console.log(`\n  ${created.resource.signing_key}\n`);
    console.log('Configure como secret na edge function:');
    console.log(`  npx supabase secrets set CALENDLY_SIGNING_KEY='${created.resource.signing_key}' \\`);
    console.log('    --project-ref szyrzxvlptqqheizyrxu');
  } else {
    console.log('\n⚠ A resposta não trouxe signing_key. Verifique no dashboard do Calendly.');
  }
})().catch((err) => {
  console.error('\n❌ Falhou:', err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
