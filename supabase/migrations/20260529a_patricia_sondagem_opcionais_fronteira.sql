-- 20260529a_patricia_sondagem_opcionais_fronteira.sql
--
-- Alinha o moment "sondagem" da Patricia com o cérebro analítico
-- (patricia_diff_cognitivo.ts → DEFAULT_VIABILITY_ZONES, fronteira_defensiva < R$1.200).
--
-- Problema (observado em 29/05/2026): o texto da sondagem mandava perguntar as 2 opcionais
-- (viagem internacional + ajuda da família) quando "destino fora dos top tier Caribe/Maldivas
-- OU valor/convidado baixo". O gatilho de DESTINO contradizia o cérebro e fazia a Patricia
-- investigar opcionais em casais já qualificados (ex: Nordeste + R$4.000/convidado = ~40 pts,
-- threshold 25). Também havia inconsistência interna (anchor dizia R$1.000, intent R$2.500).
--
-- Correção: opcionais viram SÓ desempate de fronteira por investimento/convidado (~R$1.200,
-- fonte única = cérebro). Destino deixa de ser gatilho. Casal qualificado pelos críticos →
-- ponte curta + desfecho, sem perguntar opcionais.
--
-- Agente Patricia (single_agent_v2): 4d96d9b4-e909-4441-bd85-d3f807cccfa7. Patricia ativa=false.
-- Destino fora-de-catálogo (Bali/Japão/etc.) continua tratado em moment próprio
-- (destino_fora_catalogo) + regra disqualify destino_fora_catalogo_sem_flex — não afetado aqui.

UPDATE ai_agent_moments
SET
  anchor_text = $anchor$Conhecer o casal com no máximo DUAS perguntas por turno. Priorizar sempre os 4 críticos: data, destino, número de convidados (que devem comparecer de fato), investimento. Ordem livre conforme a conversa flui.

Sobre as duas perguntas opcionais (rotina de viagem internacional e ajuda da família): NÃO perguntar sempre. Elas são SÓ desempate de fronteira. Pergunte SOMENTE quando, com os 4 críticos coletados, o investimento por convidado cair na zona de fronteira (abaixo de ~R$ 1.200 por convidado, conforme a auditoria de viabilidade). O destino em si NÃO é motivo pra perguntar opcionais: casar no Nordeste, no Caribe ou em qualquer região do catálogo não muda isso. Quando os 4 críticos já indicam um casal qualificado (investimento por convidado saudável), NÃO investigue: faça uma ponte curta e siga pro desfecho.$anchor$,
  intent = $intent$Coletar os 4 críticos (data, destino, convidados, investimento). As 2 OPCIONAIS (viagens internacionais no último ano + ajuda financeira da família) são desempate de FRONTEIRA e só entram quando o investimento por convidado fica na zona de fronteira (abaixo de ~R$ 1.200 por convidado, conforme a auditoria de viabilidade). O destino NÃO é gatilho de opcional: qualquer região do catálogo (Nordeste, Caribe, etc.) com investimento por convidado saudável já basta pra qualificar pelos críticos. Quando os 4 críticos indicam casal qualificado, NÃO pergunte opcionais: faça a ponte e avance pro desfecho. NUNCA pular para desfecho_nao_qualificado se o caso é fronteira e as 2 opcionais ainda não foram coletadas.$intent$,
  updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'
  AND moment_key = 'sondagem';
