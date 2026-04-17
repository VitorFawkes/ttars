# Debug do Workflow de Transcrição de Reuniões

## Diagnóstico Realizado

### Problema Identificado
O workflow de transcrição está retornando `{"message": "Workflow was started"}` de forma assíncrona, mas não está atualizando os dados do card. A IA não está extraindo os campos corretamente.

### Causa Provável
1. **responseMode incorreto**: O webhook estava configurado com `responseMode: "lastNode"`, mas o n8n em produção processa de forma assíncrona por padrão
2. **Prompt da IA**: O prompt original tinha a instrução "NÃO REPITA valores existentes", o que pode ter confundido o modelo
3. **Erro silencioso**: Sem resposta síncrona, não é possível ver erros no fluxo

## Solução Implementada

### Script de Atualização
Foi criado `scripts/update-n8n-workflow.js` com as seguintes correções:

1. **responseMode: "responseNode"** - Usa nós de resposta explícitos
2. **Nós "Respond to Webhook"** - Garante resposta síncrona com dados completos
3. **Prompt atualizado** - Remove instrução de não repetir e pede para extrair TODOS os campos
4. **Debug output** - Retorna o output raw da IA quando não há atualização

## Como Aplicar a Correção

### Passo 1: Obter API Key do n8n
1. Acesse: https://n8n-n8n.ymnmx7.easypanel.host
2. Vá em **Settings > API**
3. Crie uma nova API Key
4. Copie a key

### Passo 2: Executar Script de Atualização
```bash
N8N_API_KEY=sua_key_aqui node scripts/update-n8n-workflow.js
```

### Passo 3: Verificar Credenciais no n8n
Acesse o workflow e certifique-se de que:
- **Supabase API** está configurada em todos os nós HTTP
- **OpenAI API** (ou "Financeiro Automação") está configurada no nó GPT-4o

### Passo 4: Testar
```bash
node scripts/test-workflow-sync.js
```

## Scripts de Diagnóstico Criados

| Script | Propósito |
|--------|-----------|
| `scripts/debug-transcript-workflow.js` | Teste completo do fluxo |
| `scripts/test-workflow-sync.js` | Teste rápido do webhook |
| `scripts/check-n8n-executions.js` | Verificar execuções no n8n |
| `scripts/test-ai-extraction.js` | Testar extração diretamente no OpenAI |
| `scripts/update-n8n-workflow.js` | Atualizar workflow com correções |

## Campos Esperados da Extração

Da transcrição de teste, a IA deve extrair:

```json
{
  "destinos": ["Itália", "Roma", "Florença", "Costa Amalfitana"],
  "epoca_viagem": "Setembro",
  "motivo": "Lua de mel",
  "duracao_viagem": 15,
  "orcamento": 50000,
  "quantidade_viajantes": 2,
  "o_que_e_importante": "Gastronomia italiana, hotéis confortáveis",
  "receio_ou_medo": "Medo de avião, alergia a frutos do mar",
  "frequencia_viagem": "2x_a_3x_ao_ano",
  "usa_agencia": "não"
}
```

## Verificação Manual no n8n

Se preferir corrigir manualmente:

1. Abra o workflow "Welcome CRM - Atualização Campo Reuniões"
2. No nó **1. Webhook Trigger**:
   - Altere `responseMode` de "lastNode" para "responseNode"
3. Adicione nós **Respond to Webhook** no final de cada branch
4. No nó **5. AI Extrator**, atualize o prompt para remover "NÃO REPITA valores existentes"
5. Salve e ative o workflow

## Monitoramento

Para verificar se o workflow está funcionando:
1. Execute o teste: `node scripts/test-workflow-sync.js`
2. A resposta deve ser um JSON com `status: "success"` ou `status: "no_update"`
3. Se `no_update`, verifique o campo `ai_output` para ver o que a IA retornou
