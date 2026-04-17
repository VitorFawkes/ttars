#!/usr/bin/env node
/**
 * Substitui o nó langchain.agent por um HTTP Request direto à API do OpenAI
 * Isso dá mais controle sobre como o prompt é montado
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
  console.error('N8N_API_KEY não definida');
  process.exit(1);
}

async function run() {
  console.log('Buscando workflow...');

  const res = await fetch(`${N8N_API_URL}/api/v1/workflows/ms2tgIwCWJvWT8Kn`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  const workflow = await res.json();

  console.log('Modificando workflow...');

  // Remover o nó langchain.agent e GPT-4o
  workflow.nodes = workflow.nodes.filter(n =>
    n.name !== '5. AI Extrator' && n.name !== 'GPT-4o'
  );

  // Adicionar novo nó que monta o prompt completo
  const buildPromptNode = {
    parameters: {
      jsCode: `const data = $input.first().json;
const transcricao = data.transcricao || '';

const prompt = \`Extraia informações da transcrição abaixo e retorne APENAS um JSON válido.

TRANSCRIÇÃO:
\${transcricao}

REGRAS OBRIGATÓRIAS:
1. Extraia SOMENTE informações que o CLIENTE disse (não o consultor)
2. NÃO INVENTE dados - use EXATAMENTE o que está na transcrição
3. Se menciona "Itália", retorne "Itália" - NÃO substitua por outro país
4. Retorne APENAS JSON, sem explicações

CAMPOS:
- destinos: Array de strings (ex: ["Itália", "Roma"])
- epoca_viagem: String (ex: "setembro")
- motivo: String (ex: "Lua de mel")
- duracao_viagem: Número (ex: 15)
- orcamento: Número em reais (ex: 50000)
- quantidade_viajantes: Número (ex: 2)
- o_que_e_importante: String
- receio_ou_medo: String
- frequencia_viagem: "1x_ao_ano" | "2x_a_3x_ao_ano" | "mais_de_3x_ao_ano"
- usa_agencia: "sim" | "não"

Se não encontrar um campo, NÃO inclua no JSON.
Exemplo: {"destinos": ["Itália"], "motivo": "Lua de mel"}\`;

return [{
  json: {
    ...data,
    prompt: prompt
  }
}];`
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1100, 300],
    id: crypto.randomUUID(),
    name: "5. Monta Prompt"
  };

  // Adicionar nó HTTP que chama OpenAI
  const openAINode = {
    parameters: {
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      authentication: "predefinedCredentialType",
      nodeCredentialType: "openAiApi",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "Content-Type", value: "application/json" }
        ]
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: '={{ JSON.stringify({ model: "gpt-4o", messages: [{ role: "system", content: "Você é um extrator de dados preciso. Extraia EXATAMENTE o que está escrito. NUNCA invente informações. Retorne APENAS JSON válido." }, { role: "user", content: $json.prompt }], temperature: 0.1, response_format: { type: "json_object" } }) }}',
      options: {}
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [1320, 300],
    id: crypto.randomUUID(),
    name: "5b. OpenAI API",
    credentials: {
      openAiApi: { id: "klFbfWS7bi2oF0Uq", name: "Financeiro Automação" }
    }
  };

  // Adicionar nó que processa resposta do OpenAI
  const processResponseNode = {
    parameters: {
      jsCode: `const data = $('5. Monta Prompt').first().json;
const openaiResponse = $input.first().json;

// Extrair o conteúdo da resposta do OpenAI
let aiOutput = '{}';
try {
  aiOutput = openaiResponse.choices?.[0]?.message?.content || '{}';
} catch (e) {
  aiOutput = '{}';
}

return [{
  json: {
    ...data,
    output: aiOutput
  }
}];`
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [1540, 300],
    id: crypto.randomUUID(),
    name: "5c. Processa Resposta"
  };

  // Adicionar os novos nós
  workflow.nodes.push(buildPromptNode, openAINode, processResponseNode);

  // Atualizar conexões
  // 4. Monta Contexto -> 5. Monta Prompt
  workflow.connections["4. Monta Contexto"] = {
    main: [[{ node: "5. Monta Prompt", type: "main", index: 0 }]]
  };

  // 5. Monta Prompt -> 5b. OpenAI API
  workflow.connections["5. Monta Prompt"] = {
    main: [[{ node: "5b. OpenAI API", type: "main", index: 0 }]]
  };

  // 5b. OpenAI API -> 5c. Processa Resposta
  workflow.connections["5b. OpenAI API"] = {
    main: [[{ node: "5c. Processa Resposta", type: "main", index: 0 }]]
  };

  // 5c. Processa Resposta -> 6. Valida Output
  workflow.connections["5c. Processa Resposta"] = {
    main: [[{ node: "6. Valida Output", type: "main", index: 0 }]]
  };

  // Remover conexões antigas do GPT-4o
  delete workflow.connections["GPT-4o"];

  // Atualizar nó de validação para usar novo source
  const validateNode = workflow.nodes.find(n => n.name === "6. Valida Output");
  if (validateNode) {
    validateNode.parameters.jsCode = validateNode.parameters.jsCode
      .replace("$('5. AI Extrator')", "$('5c. Processa Resposta')");
  }

  const updatePayload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: { executionOrder: 'v1' }
  };

  // Desativar
  console.log('Desativando...');
  await fetch(`${N8N_API_URL}/api/v1/workflows/ms2tgIwCWJvWT8Kn/deactivate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  // Atualizar
  console.log('Atualizando workflow...');
  const updateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/ms2tgIwCWJvWT8Kn`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': API_KEY
    },
    body: JSON.stringify(updatePayload)
  });

  if (!updateRes.ok) {
    console.log('Erro:', await updateRes.text());
    return;
  }

  console.log('Workflow atualizado!');

  // Ativar
  console.log('Ativando...');
  await fetch(`${N8N_API_URL}/api/v1/workflows/ms2tgIwCWJvWT8Kn/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY }
  });

  console.log('\nPronto! Testando...');
  await new Promise(r => setTimeout(r, 3000));

  const testRes = await fetch(`${N8N_API_URL}/webhook/transcript-process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_id: '9e5e2ec6-c7af-4d95-a915-4d0276921ff7',
      meeting_id: 'd7914eb6-2102-4afb-8097-bda967826e74',
      transcription: `Consultor: Para onde vocês querem ir?
Cliente: Queremos ir para a Itália. Roma, Florença e Costa Amalfitana.
Consultor: Quando?
Cliente: Em setembro.
Consultor: Por qual motivo?
Cliente: É nossa lua de mel.
Consultor: Quantos dias?
Cliente: 15 dias.
Consultor: Orçamento?
Cliente: 50 mil reais.
Consultor: Quantas pessoas?
Cliente: 2 pessoas.`
    })
  });

  console.log('Status:', testRes.status);
  const text = await testRes.text();
  console.log('Resposta:', text);
}

run().catch(console.error);
