# Configurar envio de emails

Hoje o sistema está **pronto mas em modo dry-run** — todos os emails de convite,
boas-vindas e notificações são logados, mas nenhum é realmente enviado.

## Quando acontece o dry-run

Sempre que a variável `RESEND_API_KEY` não estiver configurada nos segredos
das Edge Functions do Supabase. Nesse modo, a função `send-email` retorna
`{ dry_run: true }` em vez de disparar via Resend.

O único email que chega hoje é o **reset de senha**, mas via SMTP default
do Supabase (template feio, envio lento).

## Passo a passo para ativar

### 1. Criar conta no Resend
Site: https://resend.com — plano gratuito envia 3.000 emails/mês, 100/dia.

### 2. Adicionar domínio
Em Resend → Domains → Add Domain, cadastrar o domínio do cliente
(ex: `welcomegroup.com.br`). O Resend mostra 3 registros DNS para
adicionar no provedor (Cloudflare, Registro.br, etc):
- 1 `MX`, 1 `TXT` (SPF), 1 `TXT` (DKIM).

Enquanto os registros não propagam, dá para testar com o sandbox
`onboarding@resend.dev` — ele já sai funcionando.

### 3. Gerar API Key
Em Resend → API Keys → Create API Key. Copiar o token que começa com `re_`.

### 4. Configurar segredos no Supabase
No Supabase Dashboard → Edge Functions → Manage secrets, adicionar:
- `RESEND_API_KEY` = a chave copiada no passo 3
- `RESEND_FROM` = `WelcomeCRM <no-reply@seudominio.com>` (ou o sandbox)
- `APP_URL` = `https://welcomecrm.vercel.app` (ou domínio próprio)
- (Opcional) `BRAND_NAME` = `WelcomeCRM` ou nome do cliente
- (Opcional) `BRAND_LOGO_URL` = URL pública do logo (PNG/JPG, altura ~32px)

Alternativa via CLI (precisa de `SUPABASE_ACCESS_TOKEN` no ambiente):
```bash
npx supabase secrets set RESEND_API_KEY=re_xxxxx --project-ref szyrzxvlptqqheizyrxu
npx supabase secrets set RESEND_FROM="WelcomeCRM <no-reply@seudominio.com>" --project-ref szyrzxvlptqqheizyrxu
```

### 5. Testar
```bash
source .env
curl -s -X POST "https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/send-email" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"SEU_EMAIL","template_key":"invite","variables":{"org_name":"Teste","role_name":"Admin","token":"abc","inviter_name":"Vitor"}}'
```
Se voltar `{"success":true,"id":"..."}` ao invés de `{"dry_run":true}`, está ok.

### 6. Customizar templates do Supabase Auth (login/recovery)
Estes templates **NÃO** passam pelo Resend — são enviados pelo próprio
Supabase. Para deixá-los com o mesmo visual:

1. Ir em Supabase Dashboard → Authentication → Email Templates.
2. Substituir cada template pelo HTML correspondente em `supabase/templates/`:
   - `recovery.html` → "Reset password"
   - `invite.html` → "Invite user"
   - `magic_link.html` → "Magic link"
   - `confirmation.html` → "Confirm signup"
3. Salvar.

**Alternativa mais limpa**: configurar SMTP custom em Supabase → Auth → SMTP
apontando para Resend. Aí os emails de auth passam pelo Resend também e saem
do mesmo remetente:
- Host: `smtp.resend.com` · Port: 465 · User: `resend` · Password: sua
  `RESEND_API_KEY` · Sender email: mesmo do `RESEND_FROM`.

## Emails que o sistema dispara

| Template | Quando | Onde |
|---------|--------|------|
| `invite` | Admin convida usuário / Platform cria tenant | `send-email` |
| `org_welcome` | Tenant é provisionado | `send-email` (junto com invite) |
| `password_reset` | Usuário clica "Esqueci minha senha" | `send-password-reset` |
| `lead_assigned` | **Ainda não disparado** — template pronto para quando o gatilho estiver decidido | — |

## Verificar emails enviados

Tabela `email_log` no banco tem todos os envios com `status` (sent/failed/dry_run).
Útil para debug:
```sql
SELECT to_email, template_key, status, sent_at, error FROM email_log
ORDER BY created_at DESC LIMIT 50;
```
