#!/usr/bin/env node
/**
 * Verifica as execuções recentes do workflow no n8n
 *
 * Uso: N8N_API_KEY=xxx node scripts/check-n8n-executions.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
  console.log('❌ N8N_API_KEY não definida');
  console.log('   Use: N8N_API_KEY=xxx node scripts/check-n8n-executions.js');
  console.log('');
  console.log('   Para obter a API Key:');
  console.log('   1. Acesse o n8n em:', N8N_API_URL);
  console.log('   2. Vá em Settings > API');
  console.log('   3. Crie uma nova API Key');
  process.exit(1);
}

async function getWorkflows() {
  console.log('📋 Buscando workflows...');

  const response = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
    headers: {
      'X-N8N-API-KEY': API_KEY
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.log(`❌ Erro (${response.status}): ${text}`);
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

async function getExecutions(workflowId) {
  console.log(`📊 Buscando execuções do workflow ${workflowId}...`);

  const response = await fetch(`${N8N_API_URL}/api/v1/executions?workflowId=${workflowId}&limit=5`, {
    headers: {
      'X-N8N-API-KEY': API_KEY
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.log(`❌ Erro (${response.status}): ${text}`);
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

async function getExecutionDetails(executionId) {
  const response = await fetch(`${N8N_API_URL}/api/v1/executions/${executionId}`, {
    headers: {
      'X-N8N-API-KEY': API_KEY
    }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function run() {
  console.log('═'.repeat(60));
  console.log('🔍 VERIFICANDO EXECUÇÕES DO N8N');
  console.log('═'.repeat(60));
  console.log('');

  // 1. Listar workflows
  const workflows = await getWorkflows();

  if (workflows.length === 0) {
    console.log('❌ Nenhum workflow encontrado');
    return;
  }

  console.log(`\n📋 Workflows encontrados: ${workflows.length}`);
  for (const wf of workflows) {
    console.log(`   - [${wf.id}] ${wf.name} (${wf.active ? '✅ Ativo' : '❌ Inativo'})`);
  }

  // 2. Encontrar o workflow de transcrição
  const transcriptWorkflow = workflows.find(w =>
    w.name.toLowerCase().includes('reuniões') ||
    w.name.toLowerCase().includes('reuniao') ||
    w.name.toLowerCase().includes('transcript')
  );

  if (!transcriptWorkflow) {
    console.log('\n⚠️  Workflow de transcrição não encontrado');
    console.log('   Nomes buscados: reuniões, reuniao, transcript');

    // Mostrar todos os workflows para referência
    console.log('\n   Workflows disponíveis:');
    for (const wf of workflows) {
      console.log(`   - ${wf.name}`);
    }
    return;
  }

  console.log(`\n🎯 Workflow de transcrição encontrado:`);
  console.log(`   ID: ${transcriptWorkflow.id}`);
  console.log(`   Nome: ${transcriptWorkflow.name}`);
  console.log(`   Ativo: ${transcriptWorkflow.active ? 'Sim' : 'Não'}`);

  // 3. Buscar execuções recentes
  const executions = await getExecutions(transcriptWorkflow.id);

  if (executions.length === 0) {
    console.log('\n📊 Nenhuma execução encontrada para este workflow');
    return;
  }

  console.log(`\n📊 Últimas ${executions.length} execuções:`);
  console.log('─'.repeat(60));

  for (const exec of executions) {
    const status = exec.finished
      ? (exec.stoppedAt ? '✅ Concluído' : '❌ Erro')
      : '⏳ Em andamento';

    console.log(`\n   ID: ${exec.id}`);
    console.log(`   Status: ${status}`);
    console.log(`   Início: ${exec.startedAt}`);
    console.log(`   Modo: ${exec.mode}`);

    // Se teve erro, mostrar detalhes
    if (exec.finished && !exec.stoppedAt) {
      const details = await getExecutionDetails(exec.id);
      if (details?.data?.resultData?.error) {
        console.log(`   ❌ Erro: ${details.data.resultData.error.message}`);
      }
    }
  }

  // 4. Detalhar última execução
  if (executions.length > 0) {
    const lastExec = executions[0];
    console.log('\n' + '═'.repeat(60));
    console.log('📝 DETALHES DA ÚLTIMA EXECUÇÃO');
    console.log('═'.repeat(60));

    const details = await getExecutionDetails(lastExec.id);

    if (details) {
      console.log(`\n   ID: ${details.id}`);
      console.log(`   Workflow: ${details.workflowId}`);
      console.log(`   Modo: ${details.mode}`);
      console.log(`   Finished: ${details.finished}`);

      if (details.data?.resultData?.runData) {
        console.log('\n   Nodes executados:');
        for (const [nodeName, nodeData] of Object.entries(details.data.resultData.runData)) {
          const nodeRun = nodeData[0];
          const success = nodeRun?.error ? '❌' : '✅';
          console.log(`      ${success} ${nodeName}`);

          if (nodeRun?.error) {
            console.log(`         Erro: ${nodeRun.error.message}`);
          }

          // Mostrar output para nodes importantes
          if (nodeName.includes('AI') || nodeName.includes('Valida')) {
            const output = nodeRun?.data?.main?.[0]?.[0]?.json;
            if (output) {
              console.log(`         Output: ${JSON.stringify(output).slice(0, 200)}...`);
            }
          }
        }
      }

      if (details.data?.resultData?.error) {
        console.log(`\n   ❌ Erro geral: ${details.data.resultData.error.message}`);
        if (details.data.resultData.error.stack) {
          console.log(`   Stack: ${details.data.resultData.error.stack.slice(0, 300)}...`);
        }
      }
    }
  }
}

run().catch(console.error);
