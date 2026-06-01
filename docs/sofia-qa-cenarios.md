# Sofia — QA de cenários reais (log + ferramentas + dados no prompt)

Testes feitos no webhook real (`/webhook/sdr-weddings`), travado no nº do Vitor `5511964293533`,
inspecionando a execução do n8n (nós/ferramentas que rodaram + saída do nó `Monta` que alimenta o prompt).

## Rodada 1 (2026-06-01) — 9 cenários conversacionais

### ✅ O que está correto (infra + comportamento)
- **Pipeline completo roda sempre:** `Sofia Ativa?` (gate de ligar/desligar) → `Busca Conhecimento` (RAG) → `Consolida` → `Qualifica` → `Responde Lead` → `Limpa Travessao` → `Modo Bolhas?`/`Bolha Unica`. Todos presentes em todas as execuções.
- **Ferramentas só rodam quando ligadas:** `CRM Gate` e `Agenda Gate` rodaram mas `passou=0` (gated off, pois crm/calendar desligados no default). Correto — nenhuma ferramenta indevida.
- **Dados chegam no prompt:** `Monta.momentos_txt` traz o momento de preço; `Monta.pricing_txt` traz assessoria R$ 4–18 mil + estratégia. Config → prompt OK.
- **Qualificação (julgamento LLM) coerente:** curiosidade=0–10 (frio) · hesitação por valor=52 (morno) · família ajuda a pagar=72 (qualificado) · destino indefinido=63 (morno) · casal completo (Trancoso/80/250k/outubro)=**92 (quente, qualificado)**.
- **Momentos funcionam:** hesitação → acolhe com empatia ("assusta mesmo…"); família → "casamento é coisa de família… a Planner inclui os pais"; casal qualificado → costura ("Trancoso, 80 convidados, outubro… 250 mil") e encaminha.
- **Travessão:** sem `—` nas respostas (Limpa Travessao ativo).
- **RAG:** nó `Busca Conhecimento` roda; tabela vazia → `count=0` → cai no fallback (FAQs inline/conhecimento do modelo). Cenário 9 respondeu "cuidamos de tudo" corretamente.

### ⚠️ Achados a corrigir / decidir
1. **Primeiro contato ignora a mensagem do casal.** Cenários 2 (preço), 5 (destino), 7 (pouca intenção), 8 (processo) — todos turno 1 — responderam com a **abertura literal**, ignorando a pergunta real. É o comportamento do modo "abertura exata", mas soa robótico quando o lead já chega perguntando.
   → **Recomendação:** default do modo de abertura = **"diretriz"** (ela abre E acolhe o que foi dito), ou permitir que a abertura literal inclua um reconhecimento curto da 1ª mensagem. Decisão de produto do Vitor.
2. **Vazamento de estado entre cenários (artefato de teste).** Mesmo número + sem limpar `wsdr_conversation_state` → "Marina" (cenário 6) vazou pro 9; `falta_txt` do 8 misturou "5 anos" + "Trancoso/250 mil". 
   → **Correção no harness:** limpar estado + buffer **antes de cada cenário**. Rodada 2 refeita com isolamento.

## Rodada 2 (2026-06-01) — 9 cenários, ESTADO LIMPO entre cada (isolado)

Com isolamento, o achado #1 fica **inequívoco** (não era contaminação):

| # | Cenário (1 turno = 1º contato) | Resposta | Nota |
|---|---|---|---|
| 1 | "vi vocês no instagram" | abertura canned | 10 frio |
| 2 | "quanto custa?" | **abertura canned (ignora o preço)** | 25 frio |
| 5 | "destination wedding, não sei onde" | **abertura canned (ignora)** | 45 frio |
| 7 | "só saber como funciona, casar em 5 anos" | abertura canned | 10 frio |
| 8 | "explica o que vocês fazem" | abertura canned | 25 frio |
| 9 | "vocês cuidam de tudo?" | **abertura canned (ignora)** | 35 frio |

Multi-turno (turno 2+) — **ótimos**:
| # | Última msg | Resposta (resumo) | Nota |
|---|---|---|---|
| 3 | "achei caro" | "às vezes os valores assustam… como imaginam o casamento no Nordeste?" (empatia + redireciona) | 45 frio |
| 4 | "minha mãe ajuda a pagar" | "casamento é coisa de família… como é o nome de vocês?" (acolhe) | 35 frio |
| 6 | "Trancoso, 80, 250 mil, outubro" | "Perfeito, Marina e Lucas, com 80 convidados, Trancoso… me contem o clima" (costura + avança) | **88 quente, qualificado ✅** |

### 🔴 ACHADO PRINCIPAL (confirmado, isolado) — Primeiro contato ignora a mensagem
No modo **abertura "exata" (default)**, o turno 1 SEMPRE manda a saudação canned, mesmo quando o lead já chega perguntando preço, destino ou serviço. Soa robótico num inbound real (a pessoa pergunta algo e recebe "oi, como é o nome de vocês?").
- **Causa:** `<primeira_mensagem>` = "use só no primeiro contato, exatamente assim: {abertura}". Confirmado em `Monta.abertura_txt`.
- **Recomendação:** default = modo **"diretriz"** (ela abre E reconhece o que foi dito) — testado na rodada 3 abaixo. Decisão do Vitor.

### ✅ Confirmado novamente
Pipeline completo, ferramentas gated-off corretas (CRM/Agenda gate=0), qualificação coerente (frio→quente 88), momentos (empatia/família/costura) e travessão limpos. RAG: nó roda, tabela vazia → fallback.

## Rodada 3 (2026-06-01) — FERRAMENTAS ligadas (config patch + backup/restore)

Prova anti-controle-falso: liguei cada capacidade, conversei, e li o log pra ver se a ferramenta CERTA rodou. Config **restaurada** ao fim (verificado: crm/cal off, abertura_mode None, 9435 bytes) + artefato de teste (reunião) **apagado**.

| # | Cenário | Resultado no log | Veredito |
|---|---|---|---|
| 10 | **Abertura "diretriz"** + 1º contato "quanto custa?" | reply: *"Oi! Eu sou a Sofia… nossa assessoria fica entre R$ 4 e 18 mil, conforme destino…"* — COMPÔS e respondeu o preço. `abertura_txt` = "No primeiro contato, componha… seguindo esta diretriz". | ✅ **Diretriz resolve o achado #1** (deixa de ignorar a 1ª msg) |
| 11 | **CRM ligado** + casal qualificado | `Extrai Dados=✅`, `Grava CRM=✅` → `{ok:true, action:"updated", written:[ww_destino, ww_nome_parceiro, ww_data_casamento, ww_num_convidados, ww_orcamento_faixa, ww_sdr_qualificado]}` | ✅ ferramenta CRM correta |
| 12 | **Agenda ligada** + casal confirma "quinta 15h" | `Extrai Reunião=✅`, `Marca Reunião=✅` → iso `2026-06-11T15:00`. reply: *"Vou alinhar quinta às 15h com a Wedding Planner e te confirmo"* (handoff invisível, não inventa) | ✅ ferramenta Agenda correta |

## Conclusão geral do QA
- **Tudo que liguei é REAL** (sem controle falso): pontuação, momentos, regras, CRM-write, mover-etapa (a função já move), agenda, abertura (3 modos), ligar/desligar, RAG (nó + fallback). Confirmado pelos logs de execução.
- **Dados chegam ao prompt corretamente** (verificado no nó `Monta`: tom/fases/momentos/preço/critérios/abertura).
- **Inteligência da Camila intacta** (matriz/gates/SPIN/autochecagem fixos).
- **🔴 Única decisão de produto pendente:** o **default do modo de abertura**. "Exata" (atual) ignora a 1ª mensagem do lead; **"Diretriz" resolve** (testado). Recomendação: mudar o default pra "diretriz". → decisão do Vitor.
- **RAG:** nó + busca + fallback verificados; a recuperação real (com item indexado) é o teste de UI do Vitor (cadastrar uma pergunta no editor → ela indexa com a org certa → perguntar).
