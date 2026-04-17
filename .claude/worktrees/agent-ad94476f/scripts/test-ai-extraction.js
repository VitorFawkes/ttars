#!/usr/bin/env node
/**
 * Teste direto da extração de IA usando OpenAI API
 * Isso nos ajuda a entender se o problema está na IA ou no n8n
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.log('❌ OPENAI_API_KEY não definida');
  console.log('   Use: OPENAI_API_KEY=sk-xxx node scripts/test-ai-extraction.js');
  console.log('');
  console.log('   Você pode encontrar a chave no n8n em:');
  console.log('   Settings > Credentials > OpenAI (ou Financeiro Automação)');
  process.exit(1);
}

const TRANSCRIPTION = `
Consultor: Olá, bom dia! Aqui é da Welcome Trips. Como posso ajudar?

Cliente: Oi! Estou planejando minha lua de mel com meu marido.

Consultor: Que lindo! Para onde vocês gostariam de ir?

Cliente: Queremos ir para a Itália. Roma, Florença e Costa Amalfitana.

Consultor: Ótima escolha! Quantos dias de viagem?

Cliente: Pensamos em 15 dias.

Consultor: E qual o orçamento aproximado?

Cliente: Temos 50 mil reais para a viagem toda.

Consultor: Perfeito! Quantas pessoas vão viajar?

Cliente: Somos 2, eu e meu marido.

Consultor: E quando pretendem viajar?

Cliente: Em setembro deste ano.

Consultor: O que é mais importante para vocês na viagem?

Cliente: A gastronomia italiana! Adoramos comer bem. E hotéis confortáveis.

Consultor: Algum receio ou preocupação?

Cliente: Meu marido tem medo de avião. E eu sou alérgica a frutos do mar.

Consultor: Vocês costumam viajar com frequência?

Cliente: Viajamos internacionalmente umas 2 vezes por ano.

Consultor: E costumam usar agência?

Cliente: Não, geralmente fazemos por conta própria.
`;

const PROMPT = `# TAREFA: Extrair informações da TRANSCRIÇÃO DE REUNIÃO para o CRM

## TRANSCRIÇÃO DA REUNIÃO
${TRANSCRIPTION}

---

# INSTRUÇÕES DE EXTRAÇÃO

Analise a transcrição acima e extraia informações que o **CLIENTE** mencionou.
Em uma reunião, identifique quem é o cliente (geralmente quem NÃO é da Welcome Trips/agência).
Extraia APENAS informações ditas pelo cliente.

---

# CAMPOS DISPONÍVEIS

## 1. destinos - Array de strings com destinos ["Itália", "Paris"]
## 2. epoca_viagem - String: "Janeiro 2026", "Férias de julho"
## 3. motivo - String: "Lua de mel", "Aniversário de casamento"
## 4. duracao_viagem - Número de dias: 10, 15, 21
## 5. orcamento - Número em reais: 50000, 100000
## 6. quantidade_viajantes - Número: 2, 4, 6
## 7. servico_contratado - Boolean: true/false
## 8. qual_servio_contratado - String: "Voos", "Hospedagem"
## 9. momento_viagem - String: "Comemorando 10 anos de casamento"
## 10. prioridade_viagem - Array: ["viagem_alto_padrão", "melhor_custo_x_benefício"]
## 11. o_que_e_importante - String livre
## 12. algo_especial_viagem - String livre
## 13. receio_ou_medo - String livre
## 14. frequencia_viagem - "1x_ao_ano" | "2x_a_3x_ao_ano" | "mais_de_3x_ao_ano"
## 15. usa_agencia - "sim" | "não"

---

# REGRAS

1. EXTRAIA APENAS do CLIENTE
2. NÃO INVENTE informações
3. USE FORMATOS EXATOS
4. RETORNE APENAS JSON válido
5. Extraia TODOS os campos que encontrar na transcrição

Exemplo de resposta:
{"destinos": ["Itália"], "quantidade_viajantes": 2, "motivo": "Lua de mel"}`;

async function testOpenAI() {
  console.log('═'.repeat(60));
  console.log('🤖 TESTE DIRETO DA EXTRAÇÃO COM OPENAI');
  console.log('═'.repeat(60));
  console.log('');

  console.log('📝 Transcrição:', TRANSCRIPTION.length, 'caracteres');
  console.log('');

  const startTime = Date.now();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Você extrai dados de transcrições de reuniões para o CRM da Welcome Trips. Retorne APENAS JSON válido.'
          },
          {
            role: 'user',
            content: PROMPT
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });

    const elapsed = Date.now() - startTime;
    console.log(`⏱️  Tempo de resposta: ${elapsed}ms`);
    console.log(`📊 Status HTTP: ${response.status}`);
    console.log('');

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Erro da API:', errorText);
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    console.log('📥 Resposta da IA:');
    console.log('─'.repeat(60));

    try {
      const parsed = JSON.parse(content);
      console.log(JSON.stringify(parsed, null, 2));
      console.log('─'.repeat(60));

      // Verificar campos extraídos
      console.log('\n✅ Campos extraídos:');
      const expected = ['destinos', 'epoca_viagem', 'motivo', 'duracao_viagem', 'orcamento',
        'quantidade_viajantes', 'o_que_e_importante', 'receio_ou_medo', 'frequencia_viagem', 'usa_agencia'];

      for (const campo of expected) {
        const valor = parsed[campo];
        if (valor !== undefined && valor !== null && valor !== '') {
          console.log(`   ✓ ${campo}: ${JSON.stringify(valor)}`);
        } else {
          console.log(`   ✗ ${campo}: (não extraído)`);
        }
      }

    } catch {
      console.log('Raw content:', content);
    }

    console.log('\n📊 Uso de tokens:');
    console.log(`   Prompt: ${data.usage?.prompt_tokens}`);
    console.log(`   Completion: ${data.usage?.completion_tokens}`);
    console.log(`   Total: ${data.usage?.total_tokens}`);

  } catch (error) {
    console.log('❌ Erro:', error.message);
  }
}

testOpenAI();
