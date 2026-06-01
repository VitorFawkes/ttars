# Patricia × Sofia — tabela minuciosa de editabilidade

> Cada controle que a **Patricia** oferece, e se ele **é ou não editável na Sofia** — e o porquê.
> Atualizado depois da **Fase 1** (pontuação, sondagem, abertura flexível, controle total das regras).

## Legenda

| Símbolo | Significado |
|---|---|
| ✅ | **Já dá pra editar** na Sofia (entregue agora ou já existia) |
| 🟡 | Dá, mas **versão simples** — vou aprofundar |
| 🔜 | **Vai dar** — planejado (Fase 2 / 3 / 4) |
| 🚫 | **Não vai virar editável** — e a coluna "Por quê" explica |

## Os 3 motivos de algo ser 🚫 (não editável) na Sofia

- **(A) É a inteligência da Camila** — o *jeito de pensar* (decidir a próxima pergunta, quando convidar, autoconferência). Mexer aqui mudaria a inteligência que você pediu pra preservar.
- **(B) É engenharia de IA** — modelo, temperatura, validador interno. Um leigo não decide isso por conhecimento de negócio; fica no código (senão é "controle falso").
- **(C) É do motor da Patricia** — ela é outro tipo de robô. Trazer isso pro motor da Sofia (n8n) viraria outra coisa, ou exigiria transformar o cérebro dela.

---

## 1. Identidade

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Nome da persona | Como ela se chama | ✅ | Já existia. Decisão de negócio. |
| Empresa / marca | Nome da empresa | ✅ | Já existia. |
| Descrição da empresa | Frase de apresentação | ✅ | Já existia. |
| Papel / função (SDR, suporte…) | Define o papel | 🔜 Fase 2 | Decisão de negócio; campo já existe no banco, falta o seletor na tela. |
| Missão em 1 frase | Resumo da missão | 🔜 Fase 2 | Texto de negócio; enriquece o prompt. |
| Sobrepor descrição da empresa | Override por agente | 🔜 Fase 2 | Texto de negócio. |

## 2. Mensagem de abertura / Apresentação

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Modo da abertura: exata / diretriz / livre | Como ela abre a conversa | ✅ **Fase 1** | Era a sua dor nº 3. Agora você escolhe os 3 modos. |
| Variáveis ({{contact_name}}, {{date}}…) | Personaliza a abertura | ✅ **Fase 1** | O nó Monta substitui as variáveis. |
| Cenários de apresentação (6 contextos: inbound, reunião agendada, etc.) | Abertura diferente por contexto | 🔜 Fase 3 | A Sofia hoje é só inbound (entra quando o casal chama). Os cenários extras dependem do modo de interação (Fase 3). |
| Ligar/desligar cada cenário | On/off por contexto | 🔜 Fase 3 | Idem acima. |

## 3. Voz / Tom / Escuta

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Tom (seleção) | Jeito de falar | ✅ (única) | Já existe escolha única. |
| Tom — **multi-tag** (até 3) | Combina tons (ex: acolhedora + clara) | 🔜 Fase 2 | Decisão de marca; campo já criado no banco, falta os chips na tela. |
| Formalidade (slider) | Casual ↔ formal | ✅ | Já existe (escala 0–1; Patricia usa 1–5, vou alinhar — cosmético). |
| Regras de tom (emoji, pronome, pontuação, saudação, regionalismo) | 18 presets liga/desliga | 🔜 Fase 2 | Decisão de marca; campo já no banco, falta a tela. |
| Frases típicas | Frases que ela usa | 🔜 Fase 2 | Decisão de marca. |
| Frases proibidas | Frases que ela nunca usa | 🔜 Fase 2 | Decisão de marca. |
| Escuta (ecoar social, reconhecer, juntar rajadas, nunca ignorar) | 4 toggles de comportamento | 🔜 Fase 2 | Decisão de marca; campo já no banco. |
| Glossário (palavras usar / evitar) | Listas de palavras | ✅ | Já existe. |
| Exemplos de conversa real (few-shot) | Calibra o tom com casos reais | 🔜 Fase 2 | Só com **conversa real anonimizada** (nunca inventada). Campo já no banco. |
| Preview ao vivo da voz | Mostra o efeito | 🔜 Fase 4 | UX. |

## 4. Roteiro / Fases / Momentos

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Fases (criar, nome, objetivo, avançar quando) | A espinha da conversa | ✅ | Já existe (CRUD + subir/descer). |
| Reordenar fases arrastando | Drag-and-drop | 🟡 | Tem subir/descer; arrastar é só polimento (Fase 4). |
| Fases custom (sem lista fixa) | Qualquer fase | ✅ | A Sofia já deixa criar/remover/renomear livremente. |
| Momentos (reação a situações) | Ex: quando perguntam preço | ✅ | Já existe (label, instrução, gatilho, on/off). |
| Descrição de gatilho custom | "quando o casal cita resort" | 🔜 Fase 2 | Decisão de negócio; campo já no banco. |
| Biblioteca de momentos prontos | Modelos reusáveis | 🔜 Fase 2 | Conveniência; só copia texto. |
| Ações automáticas no momento (tag, mover etapa, notificar) | Dispara ação | 🔜 Fase 3 | Decisão de negócio; campo já no banco, falta a fiação. |
| Reordenar momentos | Drag-and-drop | 🟡 | Polimento (Fase 4). |

## 5. Sondagem (Discovery)

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Slots (o que coletar: destino, orçamento…) | Define os dados | ✅ **Fase 1** | Era a sua dor nº 4. |
| Prioridade (crítica / importante / extra) | Bloqueia ou não o convite | ✅ **Fase 1** | Decisão de negócio. |
| Perguntas por slot (ou vazio = improvisa) | Como ela pergunta | ✅ **Fase 1** | Decisão de negócio. |
| Precisão necessária (coverage notes) | "data precisa de mês e ano" | ✅ **Fase 1** | Guia pra IA. |
| Ligar slot a campo do CRM | Gravação automática | ✅ **Fase 1** | Decisão de negócio (lista de campos). |
| Sinais silenciosos (família, hesitação…) | O que ela observa sem perguntar | 🟡 | Já mostro um aviso; a tela detalhada vem na Fase 2/3. |

## 6. Pontuação (Scoring)

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Ligar/desligar pontuação | Usa nota numérica | ✅ **Fase 1** | Era a sua dor nº 1. |
| Pontos (peso) por critério | Quanto cada coisa vale | ✅ **Fase 1** | Decisão de negócio. |
| Nota mínima pra qualificar | Score geral | ✅ **Fase 1** | Decisão de negócio. |
| Faixas quente / morno / frio | Termômetro do casal | ✅ **Fase 1** | Decisão de negócio. |
| Tipo de regra (qualifica / desqualifica / bônus) | Como o critério age | ✅ **Fase 1** | Decisão de negócio. |
| Teto de bônus | Limite dos sinais extras | ✅ **Fase 1** | Decisão de negócio. |
| O que fazer se não qualificar (fallback) | Material / encerrar / chamar pessoa | ✅ **Fase 1** | Decisão de negócio. |
| Simulador de nota | Testa a nota na hora | ✅ **Fase 1** | Ferramenta de verificação. |
| Explicador visual (3 passos) | Mostra como soma | ✅ **Fase 1** | UX. |
| **Soma 100% mecânica (planilha)** | Calcula a nota por fórmula fixa | 🚫 **(A)** | A Sofia **julga** a nota (inteligência da Camila). Os pesos **orientam** o julgamento; virar planilha mudaria o cérebro. |
| Grupos "é um OU é outro" (exclusivos) | Só um item do grupo pontua | 🚫 **(C)** | Depende da soma mecânica da Patricia; não cabe no julgamento da Sofia. |
| Regra por campo do CRM (igual/faixa) | Condição automática por dado | 🚫 **(C)** | Idem — a Sofia avalia por julgamento (pergunta à IA), não por condição mecânica. |
| Fórmula "valor por convidado" | Faixa determinística | 🚫 **(C)** | Idem; é do motor da Patricia. |

## 7. Regras de negócio / Linhas vermelhas

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Linhas vermelhas de marca (liga/desliga) | Ex: nunca falar preço | ✅ **Fase 1** | Era a sua dor nº 2 — **controle total** (com aviso nas de qualidade). |
| Editar/excluir as travas "fixas" | Tirar até as de qualidade | ✅ **Fase 1** | Você pediu controle total; só mostro aviso ao desligar. |
| "O que ela nunca faz" (lista livre) | Comportamentos a evitar | ✅ | Já existia. |
| Escalar pra humano após N turnos | Passa o bastão | ✅ **Fase 1** | Decisão de negócio. |
| Concorrentes a não citar (lista) | Nomes proibidos | 🔜 Fase 2 | Decisão de negócio. |
| Métodos/processo da empresa, blocos custom | Textos longos de negócio | 🔜 Fase 2 | Decisão de negócio (em campos nomeados, sem prompt cru). |

## 8. Preço

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Mencionar honorário (on/off) + faixa R$ | Fala da assessoria | ✅ | Já existe. |
| Estratégia de revelar (sempre / quando perguntam / só se hesitar / segurar) | Quando fala de valor | ✅ | Já existe. |
| Nunca negociar (on/off) | Trava de desconto | ✅ | Já existe. |
| Faixas por destino (tabela) | Valores por nº de convidados | ✅ | Já existe. |
| Tom ao hesitar (empatia / firmeza) | Reação ao "tá caro" | 🔜 Fase 2 | Decisão de negócio; campo já no banco, falta o botão. |

## 9. Capacidades & Ferramentas

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Registrar no CRM (on/off) | Cria/atualiza o card | ✅ | Já existe (toggle + mover etapa). |
| Quais campos gravar / proteger | Listas de campos | 🔜 Fase 2 | Decisão de negócio; campo já no banco, falta o seletor. |
| Etapa de destino do card | Pra onde avança | 🔜 Fase 2 | Decisão de pipeline; falta o seletor de etapa. |
| Marcar reunião (on/off) + planner | Agenda interna | ✅ | Já existe (planner, duração, pular fim de semana). |
| Janelas de horário / máx. slots / janela de busca / formato de data | Detalhes da agenda | 🔜 Fase 2 | Decisão de negócio; campos já no banco. |
| Memória: quantas msgs lembrar + bolhas | Contexto e entrega humana | ✅ | Já existe (parte). |
| Memória: debounce / delay entre bolhas | Ritmo da entrega | 🔜 Fase 2 | Decisão de UX; campos já no banco. |
| Conhecimento: FAQs (perguntas/respostas) | Base de respostas | ✅ | Já existe. |
| FAQs com categoria / contexto / on-off | Metadados | 🔜 Fase 2 | Decisão de negócio. |
| Quantos itens buscar na base (top_k) | Tuning da busca | 🚫 **(B)** | Tuning interno; não é decisão de negócio (fica no código). |
| Ligar bases de conhecimento externas | Reusar KBs grandes | 🔜 Fase 3 | Depende de integrar outra tabela; maior. |
| Áudio / foto / PDF (multimodal) | Entender além de texto | ✅ | Já existe (toggles). |
| Handoff com agendamento + templates de msg | Texto do convite | 🟡 → 🔜 Fase 2 | Tem o básico; templates de mensagem vêm depois. |
| Contatos secundários (papel + campos) | Pais/responsáveis | 🔜 Fase 3 | Decisão de negócio operacional. |
| **Skills picker (catálogo de ferramentas)** | Liga "skills" reusáveis | 🚫 **(C)** | É arquitetura da Patricia (catálogo de skills); a Sofia tem as ferramentas embutidas no fluxo. |

## 10. Cenários especiais / Modelos de comportamento

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Cenários especiais (gatilho → ajuste + ações) | Ex: lua de mel → encaminha | 🔜 Fase 3 | Decisão de negócio; reusa o motor de momentos+ações. |
| Comportamento temporal (debounce, delay, blocos) | Ritmo das respostas | 🔜 Fase 2/3 | Decisão de UX; parte já no banco (memória). |
| **Modelo de IA por fase** (formatter, validator…) | Modelo diferente por etapa | 🚫 **(B)** | Engenharia de IA; decidido no código (a Sofia usa um modelo principal + um auxiliar). |

## 11. Modo de interação / Ativação / Linhas / Teste

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Modo inbound / outbound / hybrid | Ela só responde ou também aborda | 🔜 Fase 3 | Decisão de negócio; campo já no banco. Hoje é inbound. |
| Primeira mensagem (tipo, template, delay) | Abordagem ativa | 🔜 Fase 3 | Depende do outbound. |
| Gatilhos outbound (card criado, etapa mudou, X dias parado) | Quando abordar | 🔜 Fase 3 | Decisão de negócio; exige fiação extra. |
| Horário comercial / fuso / dias | Janela de envio | 🔜 Fase 3 | Decisão de negócio. |
| Limites de envio (anti-spam) | Máx. por dia / por contato | 🔜 Fase 3 | Decisão de negócio. |
| Ativar/desativar o agente | Liga/desliga | 🔜 Fase 3 | Hoje a Sofia está travada no seu número (segurança). |
| Linhas de WhatsApp (lista, on/off, filtro) | Quais números ela atende | 🔜 Fase 3 | Decisão operacional. |
| Teste ao vivo (chat) | Conversar com ela | ✅ | Já existe (painel "Testar a conversa"). |
| Teste com **visor do prompt + execução por turno** | Ver o que ela "pensou" | 🔜 Fase 4 | Ferramenta de inspeção; UX. |
| Teste outbound (disparar 1ª msg) | Testar abordagem | 🔜 Fase 3 | Depende do outbound. |

## 12. Saúde da configuração

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Checagens de config (campos faltando, conflitos) | Avisa o que está incompleto | 🔜 Fase 3 | Diagnóstico puro; ajuda você a configurar certo. |

## 13. Design / UX / UI

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| "Sugerir variações" em campos de texto | 3 opções pra escolher | 🔜 Fase 4 | UX (não muda o cérebro). |
| Preview humano estruturado | Mostra o que ela faz, em blocos | 🟡 → 🔜 Fase 4 | Tem um resumo simples hoje; vou deixar visual. |
| Teste lado a lado (chat + prompt) | Conversa e prompt juntos | 🔜 Fase 4 | UX. |
| Aviso de "não salvo" por aba | Bolinha na aba | 🔜 Fase 4 | UX. |
| Comparar versões / histórico | Antes/depois | 🔜 Fase 4 | UX. |
| Atalhos de teclado, contador de caracteres | Conforto | 🔜 Fase 4 | UX. |

## 14. Motor de IA (fica no código — não vira tela)

| Controle (Patricia) | O que faz | Sofia | Por quê |
|---|---|---|---|
| Escolher modelo / temperatura | Qual IA, quão "criativa" | 🚫 **(B)** | Engenharia; um leigo não decide isso por negócio. |
| Regras do validador interno | Confere a resposta antes de enviar | 🚫 **(A)** | É a **autoconferência da Camila** (parte da inteligência). |
| Matriz de decisão, gates, SPIN, antipadrões | Como ela pensa o próximo passo | 🚫 **(A)** | É o coração do raciocínio da Camila — fica intacto, como você pediu. |

---

### Resumo do placar (depois da Fase 1)

- ✅ **Editável agora:** as suas 4 dores (pontuação, regras, abertura, sondagem) + o que já existia.
- 🔜 **Vai ser editável:** quase todo o resto do **conteúdo** e da **UX** (Fases 2–4) — é decisão de negócio/marca, seguro.
- 🚫 **Não vira editável (de propósito):** só o **raciocínio da Camila** (A), a **engenharia de IA** (B) e o que é **exclusivo do motor da Patricia** (C). Nada disso é "controle de leigo".
