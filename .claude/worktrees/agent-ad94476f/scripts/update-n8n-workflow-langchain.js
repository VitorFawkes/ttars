#!/usr/bin/env node
/**
 * Script para atualizar o workflow "Welcome CRM - Atualização Campo Reuniões" no n8n
 *
 * MUDANÇAS:
 * 1. Remove nós antigos de IA (HTTP Request direto)
 * 2. Adiciona nó LangChain Agent (5. AI Extrator)
 * 3. Adiciona nó GPT-5.1 (Model tool)
 * 4. Atualiza conexões e referências
 *
 * Uso: node scripts/update-n8n-workflow-langchain.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
  console.error('❌ N8N_API_KEY is required');
  process.exit(1);
}
const WORKFLOW_ID = 'ms2tgIwCWJvWT8Kn';

// System Message para a IA
const SYSTEM_MESSAGE = `Você é um especialista em extração de dados de TRANSCRIÇÕES DE REUNIÕES para o CRM da Welcome Trips, uma agência de viagens de luxo.

## COMO IDENTIFICAR CLIENTE VS CONSULTOR

A transcrição pode vir em diversos formatos. Use estas pistas para identificar quem é quem:

**CONSULTOR (Welcome Trips):**
- Menciona "Welcome Trips", "nossa agência", "nosso serviço"
- Faz perguntas sobre a viagem ("Para onde quer ir?", "Qual o orçamento?")
- Explica pacotes, opções, preços
- Labels comuns: "Consultor", "Agente", "Welcome", nomes com sobrenome corporativo

**CLIENTE:**
- Responde às perguntas do consultor
- Expressa desejos e sonhos ("quero", "gostaria", "sonho com")
- Fala sobre si ou família ("meu marido", "minha esposa", "nossos filhos", "a gente")
- Menciona limitações pessoais ("tenho medo", "sou alérgico", "não gosto")
- Labels comuns: "Cliente", primeiro nome apenas, ou quem está sendo atendido

## FORMATOS DE TRANSCRIÇÃO ACEITOS

1. Com timestamps: [00:00:15] Consultor: Olá...
2. Com nomes: Maria (cliente): Quero ir para a Itália
3. Sem estrutura: Texto corrido descrevendo a reunião
4. Notas do consultor: Lista de informações coletadas
5. Chat copiado: Formato de videochamada (Zoom, Meet, Teams)

## REGRAS ABSOLUTAS

1. EXTRAIA APENAS informações do CLIENTE (não do consultor)
2. NUNCA invente - use EXATAMENTE o que está na transcrição
3. Se o cliente disse "Itália", extraia "Itália" - não substitua por "Europa"
4. USE OS FORMATOS EXATOS especificados para cada campo
5. RETORNE APENAS JSON válido - sem markdown, sem explicações
6. Se não encontrar informação para um campo, NÃO inclua o campo
7. Números devem ser números puros (50000, não "R$ 50.000")
8. Booleanos devem ser true/false (não strings)

## QUALIDADE

- Se houver contradição, use a informação mais RECENTE
- Extraia TODOS os campos encontrados, mesmo que já existam dados
- IMPORTANTE: Quando o cliente dá um RANGE (ex: "12 ou 14 dias", "80 a 90 mil"), use o valor MENOR/BASE
- Só deixe de extrair se realmente não houver informação (não se houver incerteza com números)

## SAÍDA

Resposta deve ser APENAS o JSON. Nenhum texto antes ou depois.
Se não encontrar nenhuma informação, retorne: {}`;

// User Prompt para a IA
const USER_PROMPT = `=# TAREFA: Extrair informações da TRANSCRIÇÃO DE REUNIÃO para o CRM

## CARD
Título: {{ $json.titulo }}
Fase: {{ $json.fase }}

## TRANSCRIÇÃO ({{ $json.total_caracteres }} caracteres)
{{ $json.transcricao }}

---

# CAMPOS PARA EXTRAIR

## SEÇÃO: INFORMAÇÕES DA VIAGEM

### 1. destinos
**O que é:** Lugares que o cliente quer visitar
**Formato:** Array de strings
**Exemplos:** ["Itália"], ["Roma", "Florença", "Veneza"], ["Orlando (Disney)"], ["Caribe (Cruzeiro)"]
**Extrair quando:** Cliente menciona país, cidade, região, parque temático, ou tipo de viagem
**FORMATAÇÃO ESPECIAL:** Quando houver atração/atividade DENTRO de uma região, agrupe no formato "Região (Atração)":
- Disney em Orlando → "Orlando (Disney)"
- Universal em Orlando → "Orlando (Universal)"
- Cruzeiro pelo Caribe → "Caribe (Cruzeiro)"
- Safari na África → "África do Sul (Safari)"
- Vinícolas na Toscana → "Toscana (Vinícolas)"
**Se NÃO houver relação região+atração, liste separadamente:** ["Paris", "Londres", "Roma"]

### 2. epoca_viagem
**O que é:** Quando o cliente quer viajar (apenas o MÊS ou PERÍODO)
**Formato:** String com mês e/ou ano
**Exemplos:** "Dezembro 2026", "Setembro", "Agosto a Novembro", "Julho 2026"
**Extrair quando:** Cliente menciona mês ou período
**IMPORTANTE:** Extraia APENAS o mês/período. Contextos especiais como "Natal", "Ano Novo", "Reveillon", "férias escolares" devem ir para o campo momento_viagem

### 3. motivo
**O que é:** Razão/ocasião da viagem
**Formato:** String
**Exemplos:** "Lua de mel", "Aniversário de casamento", "Férias em família", "Formatura"
**Extrair quando:** Cliente explica por que está viajando

### 4. duracao_viagem
**O que é:** Quantos dias de viagem
**Formato:** Número inteiro
**Exemplos:** 10, 15, 21
**Extrair quando:** Cliente menciona dias ou semanas (converter: 2 semanas = 14)
**IMPORTANTE:** Se cliente dá range ("12 ou 14 dias", "entre 10 e 15"), use o valor MENOR

### 5. orcamento
**O que é:** Valor disponível para a viagem
**Formato:** Número (em reais, sem formatação)
**Exemplos:** 50000, 100000, 30000
**Conversão:** "50 mil" = 50000, "cem mil" = 100000
**Extrair quando:** Cliente menciona valor, budget ou investimento
**IMPORTANTE:** Se cliente dá range ("80 a 90 mil", "entre 50 e 60"), use o valor MENOR

### 6. quantidade_viajantes
**O que é:** Número de pessoas
**Formato:** Número inteiro
**Exemplos:** 2, 4, 6
**Extrair quando:** "nós dois" = 2, "família de 4" = 4, "casal + 2 filhos" = 4

### 7. servico_contratado
**O que é:** Cliente já tem algo reservado?
**Formato:** true ou false
**Extrair quando:** Cliente menciona que já comprou passagem, reservou hotel, etc.

### 8. qual_servio_contratado
**O que é:** O que já tem reservado
**Formato:** String
**Exemplos:** "Voos", "Hospedagem", "Passagens aéreas"
**Extrair quando:** Cliente especifica o que já tem

### 9. momento_viagem
**O que é:** Contexto especial da viagem OU datas comemorativas
**Formato:** String
**Exemplos:** "Comemorando 15 anos de casamento", "Reveillon no navio", "Natal em família", "Férias escolares de dezembro"
**Extrair quando:** Cliente menciona datas comemorativas (Natal, Ano Novo, Reveillon) ou contexto especial
**IMPORTANTE:** Use este campo para datas especiais que não são simplesmente meses (Natal, Reveillon, férias escolares)

---

## SEÇÃO: INFORMAÇÕES IMPORTANTES

### 10. prioridade_viagem
**O que é:** O que é prioridade na viagem
**Formato:** Array com valores EXATOS abaixo
**Valores permitidos:**
- "priorizar_experiências_em_vez_de_hotel"
- "priorizar_hotel_em_vez_de_experiencias"
- "viagem_alto_padrão"
- "melhor_custo_x_benefício"
**Mapeamento:**
- "quero experiências incríveis" → ["priorizar_experiências_em_vez_de_hotel"]
- "hotel 5 estrelas é essencial" → ["priorizar_hotel_em_vez_de_experiencias"]
- "pode ser o melhor de tudo" / "não precisa ser o mais barato" → ["viagem_alto_padrão"]
- "orçamento é importante" / "melhor custo-benefício" → ["melhor_custo_x_benefício"]

### 11. o_que_e_importante
**O que é:** O que é importante para a viagem ser perfeita
**Formato:** String livre
**Exemplos:** "Gastronomia", "Hotéis bonitos", "Passeios culturais", "Relaxamento"
**Extrair quando:** Cliente menciona prioridades ou desejos

### 12. algo_especial_viagem
**O que é:** Algo especial planejado
**Formato:** String livre
**Exemplos:** "Pedido de casamento", "Jantar romântico", "Aula de culinária"
**Extrair quando:** Cliente menciona evento especial ou surpresa

### 13. receio_ou_medo
**O que é:** Preocupações do cliente
**Formato:** String livre
**Exemplos:** "Medo de avião", "Alergia a frutos do mar", "Filho pequeno"
**Extrair quando:** Cliente menciona medos, alergias ou preocupações

### 14. frequencia_viagem
**O que é:** Frequência de viagens internacionais
**Formato:** String com valor EXATO
**Valores permitidos:**
- "1x_ao_ano"
- "2x_a_3x_ao_ano"
- "mais_de_3x_ao_ano"
**Mapeamento:**
- "viajo uma vez por ano" → "1x_ao_ano"
- "viajamos 2 vezes" / "umas 2 vezes por ano" → "2x_a_3x_ao_ano"
- "viajo muito" / "todo mês" / "mais de 3 vezes" → "mais_de_3x_ao_ano"

### 15. usa_agencia
**O que é:** Cliente costuma usar agência?
**Formato:** String com valor EXATO
**Valores permitidos:**
- "sim"
- "não"
**Mapeamento:**
- "sempre uso agência" / "viajo com agência" → "sim"
- "organizo por conta própria" / "nunca usei" → "não"

---

# FORMATO DE RESPOSTA

Retorne APENAS um JSON com os campos encontrados:

{"destinos": ["Itália", "Roma"], "epoca_viagem": "Setembro", "motivo": "Lua de mel", "duracao_viagem": 15, "orcamento": 50000, "quantidade_viajantes": 2}

NÃO inclua campos sem informação.
Se não encontrar nada, retorne: {}`;

// Código do nó "6. Valida Output" atualizado
// IMPORTANTE: Transforma valores simples em objetos complexos para o frontend
const VALIDA_OUTPUT_CODE = `const aiOutput = $('5. AI Extrator').first().json.output || '{}';

let extracted = {};
try {
  let cleanOutput = aiOutput;
  if (typeof cleanOutput === 'string') {
    cleanOutput = cleanOutput.replace(/\\\`\\\`\\\`json\\n?/g, '').replace(/\\\`\\\`\\\`\\n?/g, '').trim();
    extracted = JSON.parse(cleanOutput);
  } else {
    extracted = cleanOutput;
  }
} catch (e) {
  extracted = {};
}

const camposValidos = [
  'destinos', 'epoca_viagem', 'motivo', 'duracao_viagem', 'orcamento',
  'quantidade_viajantes', 'servico_contratado', 'qual_servio_contratado',
  'momento_viagem', 'degustacao_tp', 'taxa_planejamento',
  'origem_lead', 'prioridade_viagem', 'o_que_e_importante',
  'algo_especial_viagem', 'receio_ou_medo', 'frequencia_viagem', 'usa_agencia'
];

// Helper para formatar moeda
const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const produtoDataUpdate = {};
for (const campo of camposValidos) {
  const valor = extracted[campo];
  if (valor !== undefined && valor !== null && valor !== '') {

    // DESTINOS - array de strings
    if (campo === 'destinos') {
      if (typeof valor === 'string') {
        const destinos = valor.split(/[,e]/).map(d => d.trim()).filter(d => d.length > 0);
        if (destinos.length > 0) produtoDataUpdate[campo] = destinos;
      } else if (Array.isArray(valor) && valor.length > 0) {
        produtoDataUpdate[campo] = valor;
      }
    }

    // ORCAMENTO - converte número simples para objeto SmartBudget
    else if (campo === 'orcamento') {
      const num = Number(valor);
      if (!isNaN(num) && num > 0) {
        produtoDataUpdate[campo] = {
          tipo: 'total',
          valor: num,
          total_calculado: num,
          display: formatCurrency(num)
        };
      }
    }

    // DURACAO_VIAGEM - converte número simples para objeto FlexibleDuration
    else if (campo === 'duracao_viagem') {
      const num = Number(valor);
      if (!isNaN(num) && num > 0) {
        produtoDataUpdate[campo] = {
          dias_min: num,
          dias_max: num,
          display: num + ' dias'
        };
      }
    }

    // EPOCA_VIAGEM - converte string para objeto FlexibleDate estruturado
    else if (campo === 'epoca_viagem') {
      if (typeof valor === 'string' && valor.trim()) {
        const MESES = {
          'janeiro': 1, 'fevereiro': 2, 'marco': 3, 'março': 3, 'abril': 4,
          'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
          'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12
        };
        const MESES_LABELS = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        const texto = valor.trim().toLowerCase();
        const anoAtual = new Date().getFullYear();
        let epocaObj = null;

        // Tenta extrair ano do texto
        const anoMatch = texto.match(/20\\d{2}/);
        const ano = anoMatch ? parseInt(anoMatch[0]) : anoAtual;

        // Verifica se é range de meses
        const rangeMatch = texto.match(/(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\\s*(a|até|ou|e)\\s*(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i);
        if (rangeMatch) {
          const mesInicio = MESES[rangeMatch[1].toLowerCase()];
          const mesFim = MESES[rangeMatch[3].toLowerCase()];
          epocaObj = {
            tipo: 'range_meses',
            mes_inicio: mesInicio,
            mes_fim: mesFim,
            ano: ano,
            display: MESES_LABELS[mesInicio] + ' a ' + MESES_LABELS[mesFim] + ' ' + ano,
            flexivel: false
          };
        } else {
          // Verifica se é mês específico
          for (const [nomeMes, numMes] of Object.entries(MESES)) {
            if (texto.includes(nomeMes)) {
              epocaObj = {
                tipo: 'mes',
                mes_inicio: numMes,
                ano: ano,
                display: MESES_LABELS[numMes] + ' ' + ano,
                flexivel: false
              };
              break;
            }
          }
        }

        // Se não conseguiu parsear, usa indefinido
        if (!epocaObj) {
          epocaObj = {
            tipo: 'indefinido',
            display: 'A definir',
            flexivel: true
          };
        }

        produtoDataUpdate[campo] = epocaObj;
      }
    }

    // QUANTIDADE_VIAJANTES - número simples
    else if (campo === 'quantidade_viajantes') {
      const num = Number(valor);
      if (!isNaN(num) && num > 0) produtoDataUpdate[campo] = num;
    }

    // BOOLEANOS
    else if (['servico_contratado', 'degustacao_tp'].includes(campo)) {
      if (typeof valor === 'boolean') produtoDataUpdate[campo] = valor;
    }

    // OUTROS CAMPOS - mantém como está
    else {
      produtoDataUpdate[campo] = valor;
    }
  }
}

return [{
  json: {
    card_id: $('4. Monta Contexto').first().json.card_id,
    meeting_id: $('4. Monta Contexto').first().json.meeting_id,
    fase: $('4. Monta Contexto').first().json.fase,
    tem_atualizacao: Object.keys(produtoDataUpdate).length > 0,
    campos_extraidos: produtoDataUpdate,
    total_campos: Object.keys(produtoDataUpdate).length,
    ai_raw_output: aiOutput
  }
}];`;

async function updateWorkflow() {
  console.log('═'.repeat(60));
  console.log('🔄 ATUALIZANDO WORKFLOW DE TRANSCRIÇÃO');
  console.log('═'.repeat(60));
  console.log('');

  // 1. Buscar workflow atual
  console.log('1️⃣  Buscando workflow atual...');
  const getResponse = await fetch(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  if (!getResponse.ok) {
    throw new Error(`Erro ao buscar workflow: ${await getResponse.text()}`);
  }

  const workflow = await getResponse.json();
  console.log(`   ✅ Workflow encontrado: ${workflow.name}`);
  console.log(`   📊 ${workflow.nodes.length} nós encontrados`);

  // 2. Identificar nós a manter e a remover
  // IMPORTANTE: Remover também nós antigos do AI Extrator e GPT-5.1 para evitar duplicatas
  const nodesToRemove = [
    '5. Monta Prompt', '5b. OpenAI API', '5c. Processa Resposta',  // Nós HTTP Request antigos
    '5. AI Extrator', 'GPT-5.1'  // Nós LangChain que serão recriados
  ];
  const keptNodes = workflow.nodes.filter(n => !nodesToRemove.includes(n.name));

  console.log('');
  console.log('2️⃣  Removendo nós antigos de IA...');
  nodesToRemove.forEach(name => {
    const found = workflow.nodes.find(n => n.name === name);
    if (found) {
      console.log(`   🗑️  Removido: ${name}`);
    }
  });

  // 3. Atualizar nó "6. Valida Output"
  console.log('');
  console.log('3️⃣  Atualizando nó "6. Valida Output"...');
  const validaOutputNode = keptNodes.find(n => n.name === '6. Valida Output');
  if (validaOutputNode) {
    validaOutputNode.parameters.jsCode = VALIDA_OUTPUT_CODE;
    console.log('   ✅ Código atualizado para referenciar "5. AI Extrator"');
  }

  // 4. Criar novos nós
  console.log('');
  console.log('4️⃣  Criando novos nós de IA...');

  const aiExtractorNode = {
    parameters: {
      promptType: "define",
      text: USER_PROMPT,
      options: {
        systemMessage: SYSTEM_MESSAGE
      }
    },
    type: "@n8n/n8n-nodes-langchain.agent",
    typeVersion: 2.2,
    position: [1100, 300],
    id: "ai-extrator-node",
    name: "5. AI Extrator"
  };

  const gptModelNode = {
    parameters: {
      model: {
        __rl: true,
        value: "gpt-5.1",
        mode: "list",
        cachedResultName: "gpt-5.1"
      },
      options: {
        responseFormat: "json_object",
        temperature: 0.1
      }
    },
    type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    typeVersion: 1.2,
    position: [1100, 520],
    id: "gpt-model-node",
    name: "GPT-5.1",
    credentials: {
      openAiApi: {
        id: "klFbfWS7bi2oF0Uq",
        name: "Financeiro Automação"
      }
    }
  };

  console.log('   ✅ Criado: 5. AI Extrator (LangChain Agent)');
  console.log('   ✅ Criado: GPT-5.1 (Model tool)');

  // 5. Montar novo array de nós
  const newNodes = [...keptNodes, aiExtractorNode, gptModelNode];

  // 6. Atualizar conexões
  console.log('');
  console.log('5️⃣  Atualizando conexões...');

  const newConnections = {
    "1. Webhook Trigger": {
      main: [[{ node: "2. Salvar Transcrição", type: "main", index: 0 }]]
    },
    "2. Salvar Transcrição": {
      main: [[{ node: "3. Busca Card", type: "main", index: 0 }]]
    },
    "3. Busca Card": {
      main: [[{ node: "4. Monta Contexto", type: "main", index: 0 }]]
    },
    "4. Monta Contexto": {
      main: [[{ node: "5. AI Extrator", type: "main", index: 0 }]]
    },
    "5. AI Extrator": {
      main: [[{ node: "6. Valida Output", type: "main", index: 0 }]]
    },
    "GPT-5.1": {
      ai_languageModel: [[{ node: "5. AI Extrator", type: "ai_languageModel", index: 0 }]]
    },
    "6. Valida Output": {
      main: [[{ node: "7. Tem Atualização?", type: "main", index: 0 }]]
    },
    "7. Tem Atualização?": {
      main: [
        [{ node: "8. Busca produto_data Atual", type: "main", index: 0 }],
        [{ node: "13. Sem Atualização", type: "main", index: 0 }]
      ]
    },
    "8. Busca produto_data Atual": {
      main: [[{ node: "9. Merge Dados", type: "main", index: 0 }]]
    },
    "9. Merge Dados": {
      main: [[{ node: "10. Atualiza Card", type: "main", index: 0 }]]
    },
    "10. Atualiza Card": {
      main: [[{ node: "11. Atualiza Metadata", type: "main", index: 0 }]]
    },
    "11. Atualiza Metadata": {
      main: [[{ node: "12. Resposta Sucesso", type: "main", index: 0 }]]
    }
  };

  console.log('   ✅ 4. Monta Contexto → 5. AI Extrator');
  console.log('   ✅ GPT-5.1 ──(ai_languageModel)──► 5. AI Extrator');
  console.log('   ✅ 5. AI Extrator → 6. Valida Output');

  // 7. Montar workflow atualizado (apenas campos aceitos pela API)
  const updatedWorkflow = {
    name: workflow.name,
    nodes: newNodes,
    connections: newConnections,
    settings: {
      executionOrder: "v1"
    }
  };

  // 8. Fazer PUT
  console.log('');
  console.log('6️⃣  Enviando workflow atualizado para n8n...');

  const updateResponse = await fetch(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': API_KEY
    },
    body: JSON.stringify(updatedWorkflow)
  });

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`Erro ao atualizar workflow: ${errorText}`);
  }

  const result = await updateResponse.json();

  console.log('   ✅ Workflow atualizado com sucesso!');
  console.log('');
  console.log('═'.repeat(60));
  console.log('📋 RESUMO');
  console.log('═'.repeat(60));
  console.log(`   ID: ${result.id}`);
  console.log(`   Nome: ${result.name}`);
  console.log(`   Ativo: ${result.active ? 'Sim' : 'Não'}`);
  console.log(`   Total de nós: ${result.nodes?.length || 'N/A'}`);
  console.log('');
  console.log('🌐 Webhook URL:');
  console.log(`   ${N8N_API_URL}/webhook/transcript-process`);
  console.log('');
  console.log('📋 ALTERAÇÕES APLICADAS:');
  console.log('   1. ✅ Removidos nós HTTP Request (5. Monta Prompt, 5b, 5c)');
  console.log('   2. ✅ Adicionado nó LangChain Agent (5. AI Extrator)');
  console.log('   3. ✅ Adicionado nó GPT-5.1 (Model tool)');
  console.log('   4. ✅ Conexão ai_languageModel configurada');
  console.log('   5. ✅ Nó 6. Valida Output atualizado');
  console.log('');
  console.log('🧪 Para testar:');
  console.log('   node scripts/test-transcript-workflow.js');
}

updateWorkflow().catch(error => {
  console.error('');
  console.error('❌ Erro:', error.message);
  process.exit(1);
});
