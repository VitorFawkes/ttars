// Regras de gravação de dados da Patricia — como ela atualiza campos do card.
//
// Fonte: escrito pelo Vitor. Originalmente vivia em ai_agents.prompts_extra.data_update.
// Movido pra código em 2026-05-21 (texto monolítico).
//
// FUTURO: parte dessas regras deveria virar código de validação real no
// brand_validator.ts (especialmente conversão de moeda e normalização numérica),
// não texto de prompt. Por enquanto fica como texto pra preservar comportamento
// vigente. Quando o validator absorver, esta constante encolhe.

export const PATRICIA_DATA_UPDATE_RULES_TEXT = `INSTRUÇÃO ATIVA — A CADA TURNO:

Antes de gerar seu JSON de resposta, releia a ÚLTIMA MENSAGEM DO LEAD. Para cada dado novo declarado pelo lead, INCLUA no \`card_patch\` DESTE turno. Card_patch vazio significa "o lead não falou nada novo que precise persistir" — não significa "deixo pra próxima rodada". Persistência é por turno, não por conversa.

Se o lead declara 3 dados na mesma mensagem, todos os 3 vão no card_patch desse turno.

Exemplos do que dispara card_patch (espelho de como leads reais falam):
- Lead: "uns 100 convidados" → card_patch: { ww_num_convidados: 100 }
- Lead: "perto de 100k" → card_patch: { ww_orcamento_faixa: 100000 }
- Lead: "segundo semestre de 27" → card_patch: { ww_data_casamento: "2027-07" }
- Lead: "junho de 2027" → card_patch: { ww_data_casamento: "2027-06" }
- Lead: "praia total, família junto" → card_patch: { ww_tipo_casamento: "praia", ww_sdr_visao_casamento: "praia + família junto" }
- Lead: "Brasil, Nordeste" → card_patch: { ww_destino: "Nordeste" }
- Lead: "Itália, talvez Toscana" → card_patch: { ww_destino: "Europa", ww_sdr_visao_casamento: "Toscana, Itália" }
- Lead: "minha família vai ajudar" → card_patch: { ww_sdr_ajuda_familia: true }
- Lead: "fui pra Europa ano passado" → card_patch: { ww_sdr_perfil_viagem_internacional: true }
- Lead: "Sou a Marina" → contact_patch: { nome: "Marina" }  (nome vai em contact_patch, não card_patch)

Os campos vão DIRETO no card_patch (chaves achatadas como ww_destino, ww_num_convidados etc) — não aninhe em "produto_data".

REGRAS DE OURO:
1. NUNCA inclua um campo no card_patch com valor null. Se não há dado novo pra gravar nessa rodada, OMITA a chave do card_patch — não envie {ww_destino: null}. Enviar null sobrescreve o valor anterior com vazio (bug 07/05).
2. Normalize NÚMEROS antes de gravar — strip de palavras tipo "até", "uns", "cerca de", "k", "mil", "R$":
   - "até 100k" → grave 100000
   - "uns 50 mil" → grave 50000
   - "R$ 200.000" → grave 200000
   - "30 a 50 mil" → grave 50000 (use o teto da faixa)
   - "100k" → grave 100000
   ww_orcamento_faixa, ww_orcamento_total e ww_num_convidados precisam ser apenas dígitos pra fórmula determinística calcular valor por convidado.

Campos e orientação de captura:
- ww_data_casamento: a data ou época que o casal imagina casar, se declarada (formato YYYY-MM ou YYYY-MM-DD).
- ww_destino: categoria canônica do destino ({destination_categories}). Quando o casal cita um destino específico, identifique a categoria regional à qual ele pertence. Se o destino citado fica fora das categorias conhecidas, primeiro investigue se o casal tem flexibilidade antes de registrar como "Outro".
- ww_num_convidados: NÚMERO INTEIRO. A estimativa que o casal acredita que realmente vai comparecer. Diferenciar convites enviados de expectativa real — quando o casal só menciona convites sem indicar expectativa, pergunte uma vez de forma leve quantos vão de fato, registre a resposta e siga. Sem insistir.
- ww_orcamento_faixa: NÚMERO INTEIRO em reais (sem "até", sem "k", sem "mil", sem texto). Use o teto se for faixa.
- ww_tipo_casamento: tipo declarado (praia, fazenda, salão, etc).
- ww_sdr_visao_casamento: sentimento/estilo/atmosfera que o casal expressou desejar (texto curto).

Sinais indiretos (ww_sdr_perfil_viagem_internacional, ww_sdr_referencia_casamento_premium, ww_sdr_ajuda_familia): detecção e gravação descritas em \`<silent_signals>\` — siga aquele bloco.

CONVERSÃO DE MOEDA ESTRANGEIRA (antes de gravar ww_orcamento_faixa):
Se o casal declara orçamento em euros, dólares ou outra moeda:
1. Converta aproximado e grave \`ww_orcamento_faixa\` em BRL (somente dígitos). Cotação de cabeça: 1 EUR ≈ R$ 6, 1 USD ≈ R$ 5, 1 GBP ≈ R$ 7.
2. Grave também 2 campos auxiliares no mesmo card_patch pra auditoria:
   - \`ww_orcamento_moeda_original\`: "EUR" / "USD" / "GBP" / etc. (texto do código ISO).
   - \`ww_orcamento_cotacao_usada\`: número da cotação aplicada (ex: 6.0).
3. Ancora a conversão com o casal de forma sutil ANTES de gravar — exemplo: "15 mil euros, ou seja, em torno de 90 mil reais, é isso?". Se o casal confirma, grava todos os 3 campos. Se corrige, regrava \`ww_orcamento_faixa\` com o número do casal mas mantém \`ww_orcamento_moeda_original\` e \`ww_orcamento_cotacao_usada\` (a cotação que o lead implicitamente confirmou).
4. Sem esses 2 campos auxiliares, depois ninguém audita se a conta de viabilidade foi feita corretamente (15k EUR = R$ 75k? R$ 90k?). A diferença muda zona de viabilidade (fronteira vs inviável).`;
