# Guia do Desenvolvedor — WelcomeCRM

Onboarding para rodar o projeto localmente, subir melhorias e — o mais importante —
**desfazer com segurança** se algo der errado.

> Referência completa de regras de negócio e arquitetura: [`CLAUDE.md`](../CLAUDE.md) na raiz.
> Este guia é o "como começar"; o `CLAUDE.md` é a bíblia do projeto.

---

## 1. Pré-requisitos

| Ferramenta | Versão | Observação |
|---|---|---|
| Node.js | **≥ 22** | `node --version` |
| npm | que vem com o Node | gerenciador de pacotes oficial do projeto |
| Git | qualquer recente | |
| **Claude Code** | recente | **recomendado** — é onde as travas de segurança automáticas rodam |
| GitHub CLI (`gh`) | opcional | para operações de repositório |

> **Use o Claude Code.** As ~16 travas de segurança do projeto rodam dentro dele
> (bloqueiam editar `.env`, query sem isolamento de workspace, política de banco que vaza
> dados, deploy errado, etc.). Editar "no braço" num editor comum **não** dispara essas travas.

---

## 2. Credenciais (`.env`)

O projeto precisa de um `.env`. Os valores **não** ficam no Git — você os recebe do Vitor
por **canal seguro** (1Password / Bitwarden), nunca por email ou chat.

1. Copie o modelo: `cp .env.example .env`
2. Preencha com os valores recebidos.
3. **Gere os SEUS próprios tokens pessoais** onde o provedor permite — assim seu acesso é
   revogável depois sem afetar ninguém:
   - Supabase Access Token: https://supabase.com/dashboard/account/tokens
   - Vercel Token: https://vercel.com/account/tokens
4. Segredos não-pessoais (service role, n8n, ActiveCampaign, Monde, Iterpec) você copia do Vitor.

⚠️ **Atenção ao banco que o local usa:** por padrão o `.env` aponta para **PRODUÇÃO**. Ou seja,
`npm run dev` lê e escreve no banco real. Para mexer sem risco, use **staging** (ver §4).

---

## 3. Instalação

```bash
git clone https://github.com/VitorFawkes/ttars.git WelcomeCRM
cd WelcomeCRM
npm install

# Servidor MCP de contexto (usado pelo Claude Code)
cd mcp-servers/welcomecrm-context && npm install && npm run build && cd ../..

# Navegador para os testes E2E (opcional)
npm run test:e2e:install
```

---

## 4. Rodar localmente

```bash
npm run dev   # http://localhost:5714
```

| Quero... | Como |
|---|---|
| Rodar contra **PRODUÇÃO** (dado real, cuidado) | `.env` padrão |
| Rodar contra **STAGING** (seguro p/ testar) | use o `.env.development.staging` como `.env` |
| Testar uma migration sem risco | aplique no staging antes (ver §6) |

> Para testar features com dados realistas sem tocar produção, prefira o **preview automático**
> que cada PR gera no Vercel (banco descartável criado pelo Supabase Branching).

---

## 5. Subir uma melhoria — fluxo `/subir`

No Claude Code, o comando `/subir` cuida de tudo. Três modos:

| Comando | Quando | O que faz |
|---|---|---|
| `/subir rapido` | ajuste simples, config, hotfix | commit + envio direto |
| `/subir completo` | feature nova, mudança de banco | migração → qualidade → revisão → commit → envio |
| `/subir` | auto-detecta | tem `.sql` pendente → completo; senão → rápido |

Antes de subir, o `/subir` confere o build (TypeScript) e roda uma revisão de código.
A cada envio, o **CI** roda no GitHub (monta o app + checa tipos) — é a trava que pega código quebrado.

---

## 6. Mexer no banco (migrations) — sempre staging primeiro

```bash
# 1. Aplicar no STAGING (banco de testes)
bash .claude/hooks/apply-to-staging.sh supabase/migrations/SEU_ARQUIVO.sql

# 2. Testar. Depois promover para PRODUÇÃO (roda testes automáticos + smoke):
bash .claude/hooks/promote-to-prod.sh supabase/migrations/SEU_ARQUIVO.sql

# 3. Commitar o .sql (nunca deixar migration órfã no disco)
```

- **NUNCA** aplique SQL direto em produção pelo dashboard/psql — sempre pelos scripts.
- Antes de qualquer migração **destrutiva** (DROP, apagar dados, reset), use a skill
  `supabase-safety` e tenha um plano de "como desfazer" (ver §7).

---

## 7. Como DESFAZER se algo der errado  ⭐

A rede de segurança do projeto é "fácil de reverter". Saiba os 3 caminhos:

### Site / frontend (fácil)
- **1 clique:** painel do Vercel → deployment anterior → **Instant Rollback**.
- **Ou por script:** `bash scripts/vercel-rollback.sh` (volta para o último deploy estável).
- **Ou por código:** `git revert <commit> && git push` (desfaz a mudança e reenvia).
- **Automático:** se um envio na `main` quebrar produção, o smoke test reverte sozinho.

### Banco de dados (planeje antes)
- Mudança de banco **não** se desfaz com 1 clique. Antes de uma migração arriscada:
  - tenha o SQL de "como desfazer" guardado junto, **e/ou**
  - confie no **Point-in-Time Recovery** do Supabase (restaura o banco para qualquer minuto
    antes do erro) — confirme com o Vitor que está ativo no projeto de produção.
- Reconciliação de dados (ex: reimportar do Monde) preserva estado — ver `memory/feedback_monde_*`.

### Acesso
- Tokens são pessoais: revogar o acesso de alguém = apagar **os tokens dele**, sem afetar o resto.

---

## 8. Colinha — as 5 regras que mais quebram (leia antes de codar)

Estas viraram bug ≥3 vezes. As travas do Claude Code bloqueiam, mas saber evita retrabalho:

1. **Listagem por workspace** (`teams`, `pipelines`, `departments`, `cards`, etc.): sempre
   `.eq('org_id', activeOrgId)`. Sem isso, vaza dado de outro workspace.
2. **Listar usuários** de um workspace: use `org_members` (com join em `profiles`), **nunca**
   `.from('profiles').eq('org_id', ...)` — em workspace filho isso volta vazio.
3. **Hooks de config de pipeline** (`useFieldConfig`, `useStageSectionConfig`, etc.): sempre
   passar `pipelineId`. Sem isso, campo de um produto aparece na tela do outro.
4. **Migrations:** staging primeiro, depois promover; commitar o `.sql`; nunca deixar órfão.
5. **`CREATE OR REPLACE FUNCTION`:** antes, `grep` nas migrations anteriores — recriar cego
   reverte correções de outras migrations.

Detalhes completos: seção "TOP 5" no [`CLAUDE.md`](../CLAUDE.md).

---

## 9. Ferramentas úteis

```bash
npm run build       # build + checagem de tipos
npm run lint        # ESLint
npm run sync:fix    # atualiza o inventário .agent/CODEBASE.md (rode após criar hook/page/componente)
npm run test        # testes unitários (Vitest)
npm run test:e2e    # testes de ponta a ponta (Playwright)
```

No Claude Code, antes de iniciar uma task chame `get_context` (MCP) com a descrição —
ele aponta os arquivos certos e os cuidados da área.
