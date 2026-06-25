# Teste de conversa real da Sofia (SDR IA Weddings) — laudo de especialista
**Data:** 2026-06-24 · **Número simulado:** 11964293533 (Vitor) · **Cenário:** casal "Marina & Rafael", destination wedding na praia (Nordeste), do primeiro "oi" até a reunião agendada com a Wedding Planner.

> Como foi testado: 10 turnos enviados ao webhook real da Sofia em produção (`/webhook/sdr-weddings`, com o segredo), conversa multi-turno com histórico crescente. Para cada turno baixei o **log de execução completo do n8n** (`includeData=true`), que expõe o prompt resolvido de cada nó, a saída de cada um dos 5 LLMs, e o resultado de cada ferramenta (RPC). Nada foi entregue no WhatsApp real (o webhook direto só gera texto). Ao fim: reunião de teste cancelada, card zerado, contato anonimizado, estado limpo. Nenhum workflow/automação foi ativado ou alterado.

---

## 1. Veredito em uma linha
A Sofia conduziu o funil inteiro **com competência de um SDR humano bom**: abriu, descobriu, falou de preço com disciplina, **tratou objeção corretamente**, qualificou, convidou, **reconheceu pedido de horário específico, marcou a reunião certa (25/06 18h), coletou e-mail e encerrou**. O cérebro (gpt-5.5) é forte. Os erros são, na maioria, refino de conversa — **mas há 3 bugs reais** (1 grave de integridade de dado/qualificação, 2 médios de dado/alucinação) que precisam de conserto.

**Nota geral:** conversa 8.5/10 · backend de memória/dados 6/10.

---

## 2. Como a resposta é construída (cada turno)
Pipeline de **5 agentes LLM** + **ferramentas determinísticas**, rodando em sequência a cada mensagem:

| # | Nó | Modelo | Papel |
|---|----|--------|-------|
| 1 | **Consolida** | gpt-5.1 | "memória": resume o casal (`resumo`), descreve onde a conversa está (`contexto`), marca `sinais` e a `fase` |
| 2 | **Qualifica** | gpt-5.1 | avalia cada critério; a **nota final é determinística** (soma de pesos no `Parse Qualifica`), corte ≥25 |
| 3 | **Responde Lead** | **gpt-5.5** | o cérebro: escreve a fala + decide `agenda.acao` (marcar/nenhuma) numa passada só |
| 4 | **Formata Bolhas** | gpt-5.1 | quebra a resposta em 1–3 bolhas de WhatsApp |
| 5 | **Extrai Dados** | gpt-5.1 | (pós-resposta) lê a conversa e grava `ww_*` no card |

**Ferramentas (RPC) por turno:** `wsdr_get_config`, `wsdr_get_conversation_state`, `wsdr-knowledge` (RAG, 5 FAQs), `wsdr_save_conversation_state`, `wsdr_check_availability` (agenda real), `wsdr_book_meeting` (só ao marcar), `wsdr_persist_lead` (grava CRM). Gates de follow-up/handoff existem mas não dispararam.

**Custo/latência observados:** prompt do cérebro **7.606 → 8.783 tokens** (cresce com o histórico) + 4 LLMs auxiliares + **15s de debounce** = **35–47s por resposta**, sem indicador de "digitando".

**Capacidades ligadas em prod hoje:** memória/bolhas ✅, agenda ✅ (1 closer, seg–sex 10–20h, 45min), CRM ✅, knowledge ✅, handoff ✅, scoring ✅ (corte 25), multimodal ✅, follow-up ❌.

---

## 3. Transcrição anotada (10 turnos)

**T1 — Casal:** *"Oii! Achei o perfil de vocês no Instagram e fiquei encantada 🥰 ... casar em outro lugar, fora de SP"*
**Sofia:** *"Oi, Marina! Sou a Sofia, da Welcome Weddings, a gente nasceu em 2012 e cuida de Destination Weddings do começo ao fim, tudo desenhado do zero pra cada casal. Fico feliz que vocês estejam começando a pensar nisso, qual é o nome do seu noivo ou noiva?"*  ·  nota=2, não-qualif (correto).

**T2 — Casal:** *"Somos a Marina e o Rafael 💍 ... praia, talvez Trancoso ou Maragogi, algo mais intimista"*
**Sofia:** *"Marina e Rafael, praia + intimista combina muito... e Trancoso/Maragogi têm climas bem diferentes entre si. Nessa primeira conversa eu faço algumas perguntinhas pra entender se a gente consegue cuidar com a excelência que vocês merecem. Quando vocês imaginam: já têm mês ou época no radar...?"*

**T3 — Casal:** *"outubro de 2026 🙏 ... pôr do sol na praia, só a gente e quem a gente ama"*
**Sofia:** *"Essa imagem do pôr do sol... quantas pessoas vocês imaginam que vão de fato estar lá? Destination Wedding costuma ter uma presença diferente da lista de convidados."*  ·  CRM gravou `ww_data_casamento=2026-10-01` (⚠️ dia inventado).

**T4 — Casal:** *"quanto custa mais ou menos...? To meio perdida nos valores 😅"*
**Sofia:** *"...assessoria entre R$ 4 e 18 mil... e no Nordeste a referência começa em torno de R$ 40 mil para 20, R$ 100 mil para 50 e R$ 200 mil para 100... Pra trazer pra realidade de Trancoso ou Maragogi, vocês imaginam quantas pessoas...?"*  ·  preço correto, sem inventar.

**T5 — Casal:** *"só a assessoria já é 4 a 18 mil? achei salgado 😬"*
**Sofia:** *"Faz sentido bater esse susto, Marina... A assessoria é o trabalho de desenhar tudo do zero, curar fornecedores no destino, coordenar pra vocês não carregarem isso à distância, não é uma taxa solta. O que vocês imaginavam que estaria incluído nesse valor...?"*  ·  ✅ tratamento de objeção exemplar — ficou DENTRO da assessoria, não reabriu o orçamento total.

**T6 — Casal:** *"uns 80 convidados... entre 120 e 150 mil. Tá dentro do que vocês fazem?"*
**Sofia:** *"Marina, com 80 convidados e R$ 120 a 150 mil, dá pra olhar com carinho, mas é um orçamento que precisa ser bem desenhado... acho que faz sentido conversarem com a nossa Wedding Planner... Tenho hoje 18h30 ou 19h, ou amanhã 10h, 10h30 e 11h, qual fica melhor?"*  ·  **nota=40, QUALIFICOU** (Nordeste 15 + orçamento 100-200k 15 + 80 convidados 10).

**T7 — Casal:** *"Pode ser sim! Mas hoje tá corrido... tem horário amanhã no fim da tarde?"*
**Sofia:** *"Tem sim, Marina. Amanhã consigo 17h30, 18h ou 18h30... Qual desses fica melhor?"*  ·  ✅ reconheceu o período e ofereceu da lista real.

**T8 — Casal:** *"Perfeito, pode ser 18h então!"*
**Sofia:** *"Perfeito, Marina, deixei reservado amanhã às 18h com a nossa Wedding Planner... Me manda um e-mail de vocês...?"*  ·  ✅ **REUNIÃO MARCADA** (`wsdr_book_meeting` ok, closer Ana, card → Reunião Agendada).

**T9 — Casal:** *"meu email é marina.alves.teste@gmail.com 😊"*
**Sofia:** *"Obrigada, Marina! O convite vai nesse e-mail, e a conversa fica amanhã, 25/06, às 18h. Se o Rafael quiser receber também..."*  ·  ⚠️ **nota despencou para 22 / NÃO-qualificado** e CRM gravou `ww_sdr_qualificado=false` (sobrescrevendo o `true`).

**T10 — Casal:** *"que alívio, muito obrigada Sofia! ... 💛"*
**Sofia:** *"Fico muito feliz de ler isso, Marina 💛 A ideia é justamente tirar esse peso... Amanhã às 18h a nossa Wedding Planner aprofunda tudo com vocês."*  ·  nota voltou a 40. Re-pitch + 3ª repetição do horário.

---

## 4. Achados — duas óticas (conteúdo · por que mudar · por que foi gerado assim · como corrigir)

### 🔴 F1 — GRAVE · A nota oscila e DESQUALIFICA um casal já qualificado e agendado (memória `resumo` congelada)
- **Conteúdo:** no T9 (casal já com reunião marcada) a nota caiu de **40 → 22**, virando "não-qualificado", e o CRM gravou `ww_sdr_qualificado=false`. No T10 voltou a 40. A flag no card piscou **true → false → true** entre T8/T9/T10.
- **Por que está errado (SDR):** um casal qualificado e **com reunião marcada** não pode ser marcado como "não qualificado" no CRM. A Wedding Planner abre o card e vê um lead "frio"/desqualificado que na verdade fechou. Pior: se o casal tivesse aceitado o horário no T9 (em vez do T8), a trava de qualificação teria **bloqueado o agendamento** (o convite e a rede de segurança de marcação exigem `qualificado != false`).
- **Por que foi gerado assim (IA):** o **Consolidador** mantém os fatos essenciais (convidados, orçamento, data) só no campo de prosa `contexto` e **nunca os promove para o `resumo` estruturado**. O `resumo` ficou **congelado desde o T2** repetindo *"Ainda não informaram convidados, orçamento, nem data"* (a instrução "memória cumulativa: repita o anterior INTEIRO" faz ele re-copiar a linha velha). O **Qualificador** re-deriva a nota do `resumo`+`contexto` a cada turno; no T9 ele acreditou no `resumo` ("não informaram orçamento") e **perdeu o orçamento** (valor=null) → caíram 15 pontos essenciais → <25. É a oscilação D1 que a auditoria de 2026-06-10 tentou fechar e **não fechou**.
- **Como deveria ser:** (1) o `resumo` deve ter **esqueleto fixo** (destino / convidados / orçamento / data / família / pesquisou), cada campo "?" até ser sabido, e um **merge determinístico no `Parse Consolida`** que, uma vez preenchido, **nunca volta a vazio**. (2) Melhor ainda: parar de re-julgar a qualificação de uma "memória" difusa a cada turno — calcular a nota dos **valores já extraídos e persistidos** (o `Extrai Dados` já tem convidados/orçamento), de forma **monotônica** (critério atendido não desatende sem contradição explícita). (3) Tornar `ww_sdr_qualificado` monotônico no `persist` (não sobrescrever `true` por `false` sem um desqualificador real).

### 🔴 F2 — MÉDIO · O extrator inventa o DIA da data ("outubro 2026" → 2026-10-01)
- **Conteúdo:** o casal disse *"outubro de 2026"* (sem dia). O CRM gravou `ww_data_casamento = 2026-10-01` em todos os turnos. A Planner vê "01/10/2026" como se fosse data confirmada.
- **Por que está errado (dado):** é um dado falso com aparência de preciso. Decisões de disponibilidade/orçamento podem ser tomadas em cima de um dia que ninguém escolheu.
- **Por que foi gerado assim:** o `EXTRACT_SYSTEM` pede `ww_data_casamento` no formato `YYYY-MM-DD`. O modelo normaliza mês/ano para data cheia, fabricando o dia 01. A regra "só o que o casal afirma" barra hipótese, mas **não barra a sobre-precisão**.
- **Como deveria ser:** aceitar data parcial — instruir "se vier só mês/ano, NÃO complete o dia; devolva 'outubro/2026' ou '2026-10'". Idealmente um campo/flag de precisão (mês vs dia) e o tipo do campo no CRM aceitar parcial.

### 🟠 F3 — MÉDIO · Alucinação factual fora do guard "nunca invente" (clima/geografia)
- **Conteúdo (T2):** *"Trancoso/Maragogi têm climas bem diferentes entre si"*. São duas praias do Nordeste, clima tropical parecido — a afirmação é inventada para soar conhecedora.
- **Por que está errado (SDR + IA):** um casal que pesquisou pega a imprecisão e a confiança cai; ou planeja em cima de uma premissa falsa. Vendedor especialista não erra geografia básica do próprio produto.
- **Por que foi gerado assim:** a linha vermelha "JAMAIS INVENTE" cobre **preço, data, disponibilidade, capacidade, política, fornecedores** — **não** cobre afirmações casuais sobre o destino (clima, melhor época, distâncias). O cérebro preenche "cor de especialista" livremente.
- **Como deveria ser:** estender o "nunca invente" para **qualquer afirmação específica sobre o destino** ("fale do que sabe com leveza; detalhe de destino quem confirma é a curadoria/Planner") **ou** colocar fatos reais dos destinos na base de conhecimento (RAG) para a afirmação ser ancorada.

### 🟠 F4 — ESTRUTURAL · Prompt de ~8 mil tokens com redundância e contradição
- **Conteúdo:** o prompt do cérebro tem **7,6k–8,8k tokens**. As "linhas vermelhas" repetem "nunca preço fechado", "nunca inventar destino", "nunca transferir", "não repetir" **2 a 4 vezes** cada (regras curadas + fronteiras custom + glossário + "como conversa"). O bloco inteiro de **agenda (~30 linhas + 4 dias de horários) aparece desde o T1**, com nota 2.
- **Por que está errado (IA):** a própria diretriz do projeto (prompt-first) diz que **modelo de raciocínio piora com contradição/redundância**. Além do custo: ~8k tokens × 5 LLMs × todo turno.
- **Por que foi gerado assim:** a config acumulou ao longo de muitas sessões; `boundaries.custom` duplica as regras curadas com outras palavras; a agenda é calculada incondicionalmente todo turno.
- **Como deveria ser:** de-duplicar as linhas vermelhas (uma fonte por regra); **renderizar o bloco de agenda só quando qualificado/perto do convite** (o `Monta` já sabe `qualificado`); fundir a sobreposição glossário ↔ "como conversa". Dá pra cortar ~30–40% do prompt.

### 🟠 F5 — MÉDIO · ~40s por resposta, sem "digitando…"
- **Conteúdo:** cada turno levou **35–47s** (15s de debounce + 4 LLMs no caminho crítico + cérebro de 8k tokens). O lead espera ~40s sem nenhum sinal de "digitando".
- **Por que está errado (SDR/UX):** para um lead quente, 40s de silêncio convida a re-mandar mensagem ou esfriar.
- **Por que foi gerado assim:** pipeline sequencial de 4–5 LLMs + debounce de 15s, tudo síncrono. `wsdr_check_availability` e a busca de conhecimento (RAG) rodam **todo turno**, mesmo sem necessidade.
- **Como deveria ser:** (a) indicador de "digitando" (exige endpoint na echo-api) ou um micro-ack instantâneo; (b) gate na agenda/RAG (só rodar quando faz sentido); (c) avaliar paralelizar Consolida/Qualifica.

### 🟡 F6 — BAIXO · Abertura configurada ≠ abertura que roda (controle falso)
- **Conteúdo:** a config tem uma abertura literal (*"Oi! Aqui é a Sofia... Me fala o nome do casal e o seu"*) **e** 3 "passos de abertura" — mas o modo é `free` e `opening_stepped=false`, então **os dois são ignorados**; o cérebro compõe livre.
- **Por que está errado:** quem editar o texto de abertura na tela **não vê mudança** — exatamente o "controle falso" que o projeto combate. E a abertura em passos que a equipe desenhou não está no ar.
- **Como deveria ser:** alinhar — ou colocar o modo em `stepped`/`literal` para honrar o que está configurado, ou esconder/limpar os campos inertes para a tela não prometer controle que não existe.

### 🟡 F7 — BAIXO · O Qualificador sugere falas fora do tom (e às vezes movimento de SDR errado)
- **Conteúdo:** a `proxima_pergunta_sugerida` injetada no cérebro começou com **"Que delícia..."** (T1, T3) — a muleta que o tom proíbe — e no **T5 sugeriu reabrir o orçamento total** durante a objeção à assessoria (contra o `<tratar_objecao>`). O cérebro **ignorou** as duas, mas é ruído/risco no prompt.
- **Por que foi gerado assim:** o Qualificador (gpt-5.1) não é vinculado ao glossário de marca nem à doutrina de objeção; é um gerador genérico de "próxima pergunta".
- **Como deveria ser:** passar a sugestão pelo mesmo guard de tom/objeção, ou rebaixá-la (o cérebro já tem os alvos de descoberta). No mínimo avisar o Qualificador das palavras proibidas e do "não reabrir variável que o casal não questionou".

### 🟡 F8 — BAIXO · Triagem ("ver se conseguimos te atender") cedo demais + slot "hoje 18h30" para lead sem pressa
- **Conteúdo (T2):** *"...pra entender se a gente consegue cuidar com a excelência que vocês merecem"* no 2º turno (enquadramento de "porteiro"). **(T6):** ofereceu *"hoje 18h30 ou 19h"* a um casal planejando out/2026 sem urgência.
- **Por que está errado (SDR):** triagem/exclusividade cedo soa fria; horário no mesmo dia (daqui 1h30) para compra de luxo de baixa urgência soa transacional/estranho.
- **Por que foi gerado assim:** o texto da fase 2 ("só aceitamos casamentos que entregamos excelência") está no prompt e vaza cedo; a lógica de slots oferece sempre os **mais próximos** (hoje) independente da temperatura do lead.
- **Como deveria ser:** suavizar a triagem para algo centrado no sonho ("pra entender o que vocês imaginam e desenhar certo"); para slots, preferir **próximo dia útil** em vez de "hoje em 1h30" quando não há urgência.

### 🟡 F9 — BAIXO · Encerramento não usa a "frase curta" do momento; re-pitch + 3ª repetição do horário
- **Conteúdo (T10):** ao "que alívio, obrigada 💛", respondeu com re-pitch de 2 frases + repetiu "amanhã 18h" pela **3ª vez seguida** (T8, T9, T10).
- **Por que foi gerado assim:** o momento `on_closing_signal` dispara em "ok/blz/obrigado" literais — "que alívio, obrigada" não casou; o cérebro defaultou para reforçar valor. Repetir o horário 3× fere o próprio guard "não repita".
- **Como deveria ser:** ampliar a detecção de encerramento para desfechos emocionais; espelhar curto ("Imagina, Marina 💛 até amanhã!") sem re-pitch; não repetir o horário depois de ancorado.

### 🟡 F10 — BAIXO · Fuso do "Hoje" em -04:00 (servidor) vs agenda/iso em -03:00 (BRT)
- **Conteúdo:** o prompt diz *"Hoje é 2026-06-24T16:05:36-04:00"* enquanto os horários e o iso de marcação são -03:00.
- **Por que importa:** 1h de desencontro no "agora" do modelo vs a agenda; casos de borda perto de antecedência mínima/"hoje" podem errar.
- **Como deveria ser:** normalizar o `$now` para America/Sao_Paulo antes de injetar.

---

## 5. O que está ótimo (não mexer)
- **Disciplina de preço:** nunca inventou valor; faixas do Nordeste corretas; assessoria mencionada só quando perguntada.
- **Tratamento de objeção (T5):** ficou no item, explicou o valor, não reabriu o total. (Fix `b417321e` segura.)
- **Agenda:** reconheceu "fim da tarde" (T7), marcou o horário escolhido entre vários (T8), ancorou a reunião e pediu e-mail, sem flip-flop.
- **Voz:** "a gente"/"vocês", zero travessão, sem dizer que é IA, sem clichê batido, espelhou emoji (💍/💛), bolhas humanas.
- **Trava de qualificação:** segurou o convite até a nota ≥25.

---

## 6. Prioridade de conserto
1. **F1 (resumo congelado → oscilação/desqualificação)** — é o único que tem risco real de **bloquear agendamento** e sujar o CRM. Conserto no Consolidador + tornar a nota monotônica + flag de qualificação monotônica.
2. **F2 (dia da data inventado)** e **F3 (alucinação de destino)** — integridade/confiança; conserto só de prompt.
3. **F4/F5 (prompt inchado + latência)** — qualidade e custo; de-dupe + gate de agenda/RAG.
4. **F6–F10** — refino de tom/UX e config honesta.

> Observação metodológica: vários desses pontos só aparecem na **conversa multi-turno longa** (a oscilação no T9, a repetição no T10). Smoke de 1–2 turnos não pega. Recomendo um cenário fixo de ~10 turnos como este no kit de regressão.
