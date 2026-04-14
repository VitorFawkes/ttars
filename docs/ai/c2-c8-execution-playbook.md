# Playbook Autônomo — Marcos C2 a C8 do Editor de Agentes

**Público:** sessão nova do Claude Code, sem contexto prévio, executando sozinha.
**Objetivo:** terminar a Frente C do roadmap sem pedir validação humana a cada passo.
**Criado em:** 2026-04-14 após conclusão de C1 e C6.

---

## Como o Vitor usa este playbook

Numa sessão nova, o Vitor cola:

> Execute os marcos C2 a C8 da Frente C conforme `docs/ai/c2-c8-execution-playbook.md`. Trabalhe autônomo, não peça validação a cada passo, só me avise quando cada marco estiver no ar em produção ou quando precisar de decisão irreversível real.

A sessão nova lê este arquivo e toca tudo. Nada de plan mode, nada de aprovação intermediária.

---

## Contexto já pronto (não refazer)

- **Frentes A, B concluídas e em produção:** páginas IA expostas no menu, Julia no hub (desligada).
- **C1 em produção:** schema das 14 configurações do agente em `ai_agents` + tabela `ai_agent_kb_links`. Defaults sensatos. Julia populada com valores reais do n8n.
- **C6 em produção:** RPCs `agent_*` alinhadas com `julia_*` (check_calendar e request_handoff). Docs em `docs/ai/julia-prompts.md`, `docs/ai/rpc-julia-vs-agent-diff.md`, `docs/ai/luna-julia-ab-plan.md`.
- **Julia em produção está DESLIGADA** (`ativa=false`). Não ativar.
- **Luna em produção:** existe como agente mas não em uso. Não ativar.

**Plano mestre:** `/Users/vitorgambetti/.claude/plans/rustling-orbiting-lollipop.md` — ler seções 5, 6, 7 antes de qualquer marco.

---

## Regras invioláveis (valem para TODOS os marcos)

1. **Nunca ativar agente, automação ou cadência.** Tudo entra desligado. `ativa=false`, `is_active=false`, toggles off. Memória: `feedback_teste_agentes_ia.md`.
2. **Migrations sempre em staging primeiro**, depois promover: `bash .claude/hooks/apply-to-staging.sh <arquivo>` → `bash .claude/hooks/promote-to-prod.sh <arquivo>`. O script já registra no log.
3. **Build tem que passar** no fim de cada marco: `npm run build` verde.
4. **Commit em PT**, com co-author Claude Opus. Branch próprio por marco: `feat/c2-editor-abas`, `feat/c3-handoff-inteligente`, etc. Merge na main com `--no-ff` + push.
5. **Nunca editar `src/database.types.ts` à mão** (hook bloqueia). Regenerar sempre de produção após promover migrations: `npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu 2>/dev/null > src/database.types.ts`.
6. **Isolamento de produto TRIPS/WEDDING e tenancy por `org_id`** — toda tabela nova tem `org_id UUID NOT NULL DEFAULT requesting_org_id()` + RLS padrão.
7. **Não mexer no workflow n8n da Julia** — só nosso código.
8. **Schema em português** (`nome`, `ordem`, `ativa`).
9. **Resposta ao Vitor em PT simples, sem jargão dev** (nada de "merge/branch/commit/PR/migration/RLS"). Formato padrão: "Pronto! X. Você consegue testar em Y. Se algo parecer errado, me avisa."
10. **Commitar TODOS os arquivos modificados relevantes por marco**, evitando deixar coisas soltas no Source Control. Arquivos de outras tarefas ignorar em silêncio (não mencionar).

---

## Marco C2 — Editor do agente por abas (núcleo do pedido)

**Objetivo:** transformar `src/pages/admin/AiAgentDetailPage.tsx` num layout de abas navegáveis onde cada aba edita um dos 14 knobs da seção 5 do plano mestre.

### Subfases (entregar nesta ordem, cada uma em um commit)

**C2a — Shell das abas + 4 abas principais:**
- Componente `AgentEditorLayout` com abas verticais (estilo Linear/Vercel): barra lateral com ícone + label, conteúdo à direita.
- Abas: **Identidade**, **Prompts**, **Modelos & Comportamento**, **Ferramentas**.
- Salvar/cancelar no topo (dirty-state por aba, não por campo).
- Cada aba lê e escreve em `ai_agents` via `useAiAgents`/`useUpdateAiAgent`.
- Preview do prompt montado na aba Prompts (variáveis `{{contato.nome}}` clicáveis pra inserir).
- Componentes de UI reutilizáveis em `src/components/ai-agent/editor/`.

**C2b — 4 abas complementares:**
- **Memória** (tipo, session key template, window size — edita `memory_config`)
- **Contexto & Campos CRM** (edita `context_fields_config`, checklist de campos visíveis/atualizáveis)
- **Multimodal** (edita `multimodal_config`, 3 toggles áudio/imagem/PDF)
- **Ativação** (linhas WhatsApp — já existe em `ai_agent_phone_line_config`; regras de ativação)

**C2c — Polimento:**
- Desfazer/refazer por aba
- Toasts de confirmação
- Atalhos de teclado (Cmd+S salva a aba atual)
- Responsivo (mobile colapsa aba lateral em dropdown)

### Critérios de aceite C2
- Vitor abre `/settings/ai-agents/<id>` e vê as 8 abas funcionando.
- Edita qualquer coisa em Julia, salva, recarrega, mudança persistiu.
- Agente de backend `execution_backend='n8n'` mostra avisos "config vive no n8n" nas abas irrelevantes (como já faz hoje).
- `npm run build` verde.

### Arquivos críticos C2
- `src/pages/admin/AiAgentDetailPage.tsx` (refatorar em abas)
- `src/components/ai-agent/editor/` (novo diretório — Tab*, useTabDirty, etc)
- `src/hooks/useAiAgents.ts` (adicionar mutations granulares por aba, se fizer sentido)

---

## Marco C3 — Handoff inteligente + decisões

**Objetivo:** 2 abas novas no editor + pipeline Luna passa a ler esses sinais dinamicamente.

### Subfases

**C3a — UI das 2 abas:**
- **Handoff:** lista dos 8 sinais de `handoff_signals` (JSONB array). Cada linha: toggle + descrição editável. Seção "O que acontece quando dispara": edita `handoff_actions` (mudar etapa, aplicar tag, notificar, mensagem de transição, pausar).
- **Decisões Inteligentes:** 9 decisões de `intelligent_decisions` (JSONB object). Cada decisão é um card: toggle + config específica (ex: quando criar reunião, pré-requisitos).

**C3b — Pipeline Luna usa sinais dinamicamente:**
- `supabase/functions/ai-agent-router/` (ou equivalente) passa a montar o prompt do agente lendo `handoff_signals` e `intelligent_decisions` do `ai_agents`.
- Sinais habilitados viram bullet points no system prompt.
- Decisões habilitadas viram instruções no prompt.
- Staging first, então produção.

### Critérios de aceite C3
- Vitor habilita "cliente insatisfeito" na Julia (embora ela rode no n8n, deixa a UI consistente).
- Edge function da Luna considera os sinais no prompt (verificar log de uma conversa de teste via `ai_agent_tool_calls`).
- Build verde, tudo em staging primeiro, promover junto ao fim.

---

## Marco C4 — Knowledge Base compartilhável

**Objetivo:** aba nova no editor + relação N:N funcional.

### Tarefas
- **Aba Conhecimento** no editor: lista de KBs vinculadas ao agente (via `ai_agent_kb_links`, tabela já existe). Toggle "compartilhar com outros agentes da conta".
- Busca de Luna passa a iterar sobre todas as KBs ligadas (hoje só usa `integration_settings.JULIA_FAQ` como fallback).
- Polir `src/pages/admin/AiKnowledgeBasePage.tsx` se necessário (UX já exposta em A1).

### Critérios
- Criar uma KB, linkar à Julia, ver no editor.
- Compartilhar com account → aparece como disponível em outros agentes da mesma conta.
- Edge function Luna testada (via curl) retornando resultado de busca na KB correta.

---

## Marco C5 — Wizard refatorado

**Objetivo:** substituir `AiAgentBuilderWizard.tsx` pela versão de 11 passos (seção 6 do plano mestre).

### Tarefas
- 11 passos navegáveis livremente (barra superior clicável).
- Cada passo tem tooltip explicativo ("o que isso faz e quando usar").
- Preview do prompt ao vivo.
- Modo "usar Julia como template": pré-preenche com os valores da Julia em `docs/ai/julia-prompts.md`.
- Reaproveita componentes de `src/components/ai-agent/editor/` (do C2).

### Critérios
- Vitor cria um novo agente fictício via wizard, completa os 11 passos, vê o agente na lista desligado.
- Voltar pra um passo anterior mantém estado preservado.

---

## Marco C7 — Modo de teste ao vivo

**Objetivo:** aba "Teste" no editor do agente — simulador de conversa real sem ativar.

### Tarefas
- Aba **Teste** com campo de mensagem + histórico fake.
- Botão "Simular resposta" dispara endpoint que roda o pipeline Luna (edge function) **contra o agente configurado**, sem gravar em `ai_conversations` nem enviar WhatsApp real.
- Mostra: resposta final, raciocínio do Think tool, tools chamadas, tempo por fase.
- Opção "usar dados de um card real" — modo "ver como a Luna responderia esse lead".
- Edge function: pode criar `ai-agent-simulate` ou parametrizar `ai-agent-router` com flag `dry_run=true`.

### Critérios
- Vitor simula uma conversa na Julia, vê resposta coerente, consegue iterar prompts no editor.
- Nenhuma mensagem real é enviada. Nenhum card é atualizado.
- Nenhum agente é ativado.

---

## Marco C8 — Templates bidirecional

**Objetivo:** ligação visual entre `message_templates` e onde são usados.

### Tarefas
- Em `MensagemTemplatePage.tsx` e no detalhe do template, adicionar seção "Usado em": lista de automações (`cadence_event_triggers` que referenciam `action_config.template_id`) + agentes (se aplicável).
- Campo `tipo` opcional em `message_templates` (hsm_oficial / conversa_livre) via migration + UI.

### Critérios
- Abrir um template mostra onde ele é usado.
- Clicar no item da lista navega pra página da automação/agente.

---

## Ordem sugerida

```
C2a → C2b → C2c (abas todas funcionando)
     ↓
C3 (handoff + decisões)   ← depende de C2
     ↓
C4 (KB compartilhável)    ← depende de C2
     ↓
C5 (wizard refatorado)    ← reaproveita C2-C4
     ↓
C7 (teste ao vivo)        ← depende de C2 mínimo
     ↓
C8 (templates bidirecional) — pode entrar em qualquer momento
```

Em paralelo está tudo bem, desde que cada frente tenha branch próprio e os arquivos não se toquem demais. C2 toca muita coisa, então priorizar termina-lo antes de disparar C3/C4/C5 em paralelo.

---

## Pipeline de execução para cada marco

Repita esta sequência para cada marco da lista:

1. **Criar branch:** `git checkout -b feat/c<N>-<slug>`
2. **Implementar:** código + testes manuais via `npm run dev` (aponta pra produção; se preferir staging, trocar `.env` por `.env.development.staging`).
3. **Se houver migration:**
   - Escrever idempotente (`IF NOT EXISTS`, `WHERE NOT EXISTS`, `ON CONFLICT`).
   - `bash .claude/hooks/apply-to-staging.sh <arquivo>`
   - Testar contra staging.
4. **Build:** `npm run build` tem que passar. Se quebrar em código não relacionado ao marco, diagnosticar e decidir: consertar (se tiver fix óbvio) ou documentar bloqueio e parar.
5. **Regenerar types (se migration aplicada):** `npx supabase gen types typescript --project-id szyrzxvlptqqheizyrxu 2>/dev/null > src/database.types.ts` (após promover a prod). Se ainda não promoveu, manual-ajustar interface em `src/hooks/useAiAgents.ts`.
6. **Sync inventário:** `npm run sync:fix`.
7. **Commit:** `git commit -m "feat(ai-agents): C<N> — <título em PT>"` com co-author.
8. **Promover migrations (se houver):** `bash .claude/hooks/promote-to-prod.sh <arquivo>` — uma de cada vez.
9. **Merge + push:** `git checkout main && git merge --no-ff && git push origin main`.
10. **Verificar em produção:** `curl` contra banco de prod pra confirmar que Julia continua `ativa=false` e que não se criou nada ativado por engano.
11. **Mensagem curta pro Vitor** (modelo): "Pronto! Marco C<N> no ar. Você consegue testar em <link/rota>. Nada foi ativado."

---

## Quando PARAR e chamar o Vitor

Só parar se:
- Decisão de produto ambígua que o código não consegue inferir (ex: "nome exato desta label no menu deve ser 'Reuniões' ou 'Encontros'?" — normalmente escolher o mais usado no resto do app).
- Ação irreversível de alto impacto (deletar dados de cliente real, cobrar de verdade, mandar email em massa pra lista de produção).
- Build quebra em código não relacionado que exige decisão de escopo (ex: outra frente grande mudou API que afeta nosso código).

Em qualquer outro caso: decidir sozinho e registrar a decisão num comment no código ou no commit.

---

## Relatório final (depois de C2-C8)

Ao terminar todos os marcos, escrever em `docs/ai/frente-c-concluida.md`:
- O que cada marco entregou
- O que ficou fora de escopo e por quê
- Pendências conhecidas (ex: piloto A/B da Luna ainda não rodado)
- Próximos passos (Frente D, ativação de agentes, etc)

E mandar um resumo de uma tela pro Vitor no final da execução.

---

## Referências técnicas rápidas

- **Plano mestre:** `/Users/vitorgambetti/.claude/plans/rustling-orbiting-lollipop.md`
- **Prompts da Julia:** `docs/ai/julia-prompts.md`
- **Divergências RPC:** `docs/ai/rpc-julia-vs-agent-diff.md`
- **Plano A/B:** `docs/ai/luna-julia-ab-plan.md`
- **Memória do projeto:** `/Users/vitorgambetti/.claude/projects/-Users-vitorgambetti-Documents-WelcomeCRM/memory/MEMORY.md`
- **Regras do WelcomeCRM:** `CLAUDE.md` na raiz
- **Inventário do código:** `.agent/CODEBASE.md` (sempre atualizar com `npm run sync:fix`)
