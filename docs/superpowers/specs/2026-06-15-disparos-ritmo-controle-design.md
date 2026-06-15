# Disparos (Weddings) — Ritmo configurável + envio manual de levas

**Data:** 2026-06-15
**Produto:** WEDDING (Welcome Weddings)
**Branch:** `feat/disparos-ritmo-controle`
**Tela:** Weddings → Disparos (`ConvidadosPage` modo `disparo` / `DisparosBoard`)
**Relacionado:** `memory/project_disparo_livre.md`, `whatsapp-oficial-vs-nao-oficial.md`

## Problema

Hoje o disparo é "set-and-forget": o usuário sobe a lista inteira, escreve a
mensagem, aperta **Disparar** e o motor agenda **todos** os destinatários de uma
vez (gap fixo 20–60s, janela 08–20h, teto diário `cap_diario` com ramp). O usuário
só acompanha o progresso e pode pausar/cancelar.

Faltam 3 controles que o Vitor pediu:

1. **Definir o ritmo** — "de quanto em quanto tempo e quantas pessoas vão" (o
   intervalo é hoje hardcoded; só o teto diário é editável).
2. **Enviar uma leva agora** — escolher pessoas específicas (ou as próximas N) e
   mandar na hora, furando a fila, sem esperar o ritmo.
3. **Saber quais faltam** — ver com clareza, no painel do disparo, quantos já
   foram e quantos ainda faltam (hoje fica escondido no relatório).

## Modelo escolhido (decisão do Vitor: "os dois juntos")

Um **ritmo automático** roda sozinho no fundo **E** o usuário pode, a qualquer
momento, **furar a fila** e mandar uma leva manual. Os dois coexistem sobre a
mesma fila (`disparo_fila`): cada pessoa é uma linha; mandar "agora" só antecipa
o `execute_at` dela. **Ninguém recebe duas vezes** (uma linha por contato, status
`sent` é terminal).

Princípio: **reaproveitar o motor existente** (`disparo_fila`, `disparo-dispatcher`
cron, opt-outs, variações IA, painel de saúde da linha). Mudam só: (a) como o
`execute_at` é calculado, (b) duas ações novas (enviar-agora, ajustar-ritmo),
(c) a UI do painel do disparo.

## Decisões de design (defaults assumidos — Vitor aprovou "pode seguir")

- **Ritmo = leva + intervalo.** O usuário define **"manda `X` pessoas a cada `Y`"**,
  com `Y` em **minutos ou horas** (dropdown de unidade). Some o input "máximo por
  dia"; no lugar mostramos o **total/dia derivado** ("≈ 80 por dia") + aviso de
  risco quando alto. Mantém a janela 08–20h e o "começar devagar" (ramp).
- **Enviar agora oferece os dois jeitos:** botão proeminente **"Enviar os próximos
  [N] agora"** (caso comum, 1 clique) **e** seleção pessoa-a-pessoa (checkboxes na
  lista de quem falta) → "Enviar selecionados agora". Cobre o "selecionar quais"
  literal sem obrigar a marcar um por um quando não precisa.
- **Manual também é espaçado.** "Enviar agora" nunca é um tiro simultâneo: as
  mensagens da leva manual saem escalonadas (~30–60s entre elas). Protege o número.
- **Ritmo editável enquanto roda.** Dá pra pausar/retomar o ritmo e mudar `X`/`Y`
  a qualquer momento; ao mudar, recalcula só os **pendentes** (preserva os enviados).
- **Backward-compat:** campanhas antigas sem `tamanho_leva` continuam funcionando
  com default derivado do `cap_diario`.

## Arquitetura

### Banco (migration `20260615a_disparo_ritmo_controle.sql`)

**Colunas novas em `disparo_campanhas`:**
- `tamanho_leva INT NOT NULL DEFAULT 10` — quantas por leva.
- `intervalo_leva_min INT NOT NULL DEFAULT 30` — minutos entre levas.
- (`cap_diario` permanece como **teto de segurança diário**, derivado/limitante,
  não mais o controle primário na UI.)

**`disparo_calcular_agenda` (reescrita do laço de scheduling):**
Em vez de gap contínuo 20–60s, agenda em **levas**: para cada janela diária
(08–20h BR), libera `tamanho_leva` pessoas, depois pula `intervalo_leva_min`,
repete. Dentro de uma leva, micro-jitter (~20–40s) pra não sair tudo no mesmo
segundo. Respeita ramp (d1/d2 reduzidos) e o teto diário de segurança. Mantém
`priority` (quem já interagiu primeiro). Determinístico por campanha.

**`disparo_enviar_agora(p_campaign_id UUID, p_fila_ids UUID[] DEFAULT NULL, p_proximos_n INT DEFAULT NULL)`** — `SECURITY DEFINER`:
- Valida que a campanha é de `requesting_org_id()` (regra CLAUDE.md §7).
- Alvo: `p_fila_ids` (seleção explícita) **ou** os próximos `p_proximos_n`
  pendentes (ordem `priority DESC, execute_at ASC`).
- Seta `execute_at = now() + escalonamento` (now, +~30s, +~60s, …) só para itens
  `status='pending'` (ignora sent/opt_out/cancelado). Bump de `priority`.
- Retorna quantos foram antecipados. O `disparo-dispatcher` (cron 1min) pega
  naturalmente (execute_at <= now).

**`disparo_ajustar_ritmo(p_campaign_id UUID, p_tamanho_leva INT, p_intervalo_leva_min INT, p_usar_ramp BOOLEAN)`** — `SECURITY DEFINER`:
- Valida org. Atualiza colunas e **recalcula `execute_at` só dos pendentes**
  (reusa a lógica de `disparo_calcular_agenda` restrita a `status='pending'`).

**Verificação a confirmar na implementação:** o `disparo-dispatcher` reforça
teto diário/janela no momento do *envio*? Se sim, o "enviar agora" fora da janela
seria bloqueado. Esperado: cap/janela são aplicados no *agendamento*
(`calcular_agenda`), e o dispatcher só envia o que está vencido — então o override
manual funciona. Validar lendo a edge antes de codar o front.

### Frontend

**`ComporDisparoModal.tsx` (criar disparo):** trocar o bloco "Ritmo de envio":
- De: "Máximo por dia" (number) + ramp.
- Para: "Manda **[X]** pessoas a cada **[Y] [minutos|horas]**" + ramp + texto
  derivado "≈ N por dia · só das 08h às 20h" + aviso de risco (reusa thresholds
  atuais: ~80 atenção, >200 alto). `estimarDias` passa a considerar leva+intervalo.
- `CriarCampanhaInput` ganha `tamanho_leva`, `intervalo_leva_min`.

**Painel do disparo (upgrade do `DisparoRelatorioModal.tsx` → "control panel"):**
- Topo: números grandes **`38 enviados · 52 faltam`** (+ falhas, + saíram) e
  **"próxima leva: 10 às 14h30"** (deriva do menor `execute_at` pending).
- Controles de ritmo: pausar/retomar + "Mudar ritmo" (mini-form → `disparo_ajustar_ritmo`).
- Lista de quem falta (já existe): adicionar **checkboxes** + barra de ação fixa
  "Enviar [N] selecionados agora"; e botão rápido "Enviar os próximos [10] agora".
  Aviso se a leva manual for grande ou fora de 08–20h ("enviar mesmo assim?").
- Mantém: filtros por status, CSV, opt-out manual, expandir mensagem.

**`DisparosBoard.tsx` (linha da campanha):** somar "Y faltam" e "próxima leva
HH:MM" ao resumo (hoje mostra só `enviados de total`).

**Hooks (`src/hooks/disparo/`):**
- `useDisparoActions`: adicionar `enviarAgora(campaignId, {filaIds?|proximosN?})` e
  `ajustarRitmo(campaignId, {tamanhoLeva, intervaloMin, usarRamp})`.
- `types.ts`: `DisparoCampanha` ganha `tamanho_leva`, `intervalo_leva_min`.
- Tabelas seguem via `sbAny` (não estão no database.types.ts).

## Fluxo

1. **Criar:** sobe lista → escreve msg → define "X a cada Y" → Revisar → Disparar.
   `calcular_agenda` agenda em levas. Status `agendado`/`disparando`.
2. **Automático:** cron `disparo-dispatcher` envia o que venceu, leva a leva.
3. **Manual:** abre painel → marca pessoas (ou "próximos N") → "Enviar agora" →
   `disparo_enviar_agora` antecipa `execute_at` → cron manda escalonado. Ritmo
   automático segue para o resto.
4. **Acompanhar:** painel mostra enviados/faltam/próxima leva em tempo real
   (realtime já existe em `useDisparoCampanhas`).
5. **Ajustar:** "Mudar ritmo" recalcula pendentes; pausar/retomar como hoje.

## Segurança / proteção do número

- Toda leva (auto **e** manual) sai escalonada — nunca simultânea.
- Teto diário de segurança permanece como limite duro; UI avisa quando o ritmo
  configurado projeta volume alto/dia.
- Opt-out por palavra-chave estrita, painel de saúde da linha e variações IA:
  inalterados.
- RPCs novas são `SECURITY DEFINER` e validam `requesting_org_id()` antes de
  qualquer mutação (regra CLAUDE.md §7; modelo `replace_cadence_steps`).
- Isolamento por workspace: campanhas já filtram `org_id` (mantém).

## Testes

- **Banco (curl/SQL real, não migration-only):** criar campanha de teste,
  `calcular_agenda` com X=3/Y=2min → conferir levas no `execute_at`; `enviar_agora`
  com 2 ids → execute_at ~now escalonado; `ajustar_ritmo` → só pendentes mudam;
  org-guard rejeita campanha de outra org. `BEGIN…ROLLBACK` para não sujar prod.
- **Teste seguro de ponta-a-ponta:** linha **"Teste Vitor"** + **só o número do
  Vitor** (11964293533), igual ao protocolo do disparo livre. Nunca lista real
  antes do ok.
- **Build/typecheck:** `npm run build`.

## Fora de escopo (YAGNI)

- Mídia/imagem (segue só texto), recorrência/agendar pra data futura, métricas
  avançadas de resposta. Ficam como ideias futuras (já listadas no memory).

## Riscos

- Reescrever o laço de `calcular_agenda` é o ponto sensível — cobrir com teste de
  banco antes do front. Default seguro se colunas novas vierem nulas.
- Confirmar comportamento do dispatcher quanto a janela/cap no envio (acima).
- Staging defasado (sem `contatos`) → validar a migration no prod read-only
  (`BEGIN…ROLLBACK`) como no histórico do disparo livre.
