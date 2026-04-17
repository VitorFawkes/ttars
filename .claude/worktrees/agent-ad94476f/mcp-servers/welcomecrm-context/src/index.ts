#!/usr/bin/env node
/**
 * WelcomeCRM Context MCP Server
 *
 * Fornece contexto estruturado do projeto para agentes de IA,
 * garantindo que o protocolo de desenvolvimento seja seguido.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { getContext } from './tools/get-context.js'
import { checkImpact } from './tools/check-impact.js'
import { verifySync } from './tools/verify-sync.js'
import { getDependencies } from './tools/get-dependencies.js'
import { loadProjectData } from './parsers/loader.js'

// Carrega dados parseados do projeto
const projectData = await loadProjectData()

// Cria o servidor MCP
const server = new Server(
  {
    name: 'welcomecrm-context',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Lista as ferramentas disponíveis
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_context',
        description: `OBRIGATÓRIO: Chame esta ferramenta ANTES de qualquer investigação ou implementação.
Retorna o contexto estruturado do projeto incluindo:
- Agent especialista correto para a tarefa
- Seções relevantes do CODEBASE.md
- Arquivos que devem ser lidos
- Hooks e tabelas relacionados
- Template de declaração de contexto

Use sempre que receber uma nova tarefa ou pergunta sobre o projeto.`,
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'Descrição da tarefa ou pergunta do usuário'
            },
            taskType: {
              type: 'string',
              enum: ['investigation', 'implementation', 'debug', 'design'],
              description: 'Tipo da tarefa: investigation (explorar), implementation (criar/modificar), debug (investigar bug), design (UI/UX)'
            },
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Palavras-chave adicionais para refinar o contexto (opcional)'
            }
          },
          required: ['task', 'taskType']
        }
      },
      {
        name: 'check_impact',
        description: `Analisa o "blast radius" (raio de impacto) antes de modificar arquivos.
Retorna:
- Dependências diretas que serão afetadas
- Hooks que usam os arquivos
- Tabelas envolvidas
- Nível de risco da mudança
- Testes que devem ser executados

Use ANTES de fazer qualquer modificação em código existente.`,
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Caminhos dos arquivos que serão modificados'
            },
            action: {
              type: 'string',
              enum: ['modify', 'delete', 'rename'],
              description: 'Tipo de ação que será realizada'
            },
            description: {
              type: 'string',
              description: 'Descrição da mudança planejada (opcional)'
            }
          },
          required: ['files', 'action']
        }
      },
      {
        name: 'verify_sync',
        description: `Verifica se a documentação (CODEBASE.md) está sincronizada com o código real.
Compara:
- Hooks documentados vs hooks encontrados no código
- Páginas documentadas vs páginas encontradas
- Componentes documentados vs componentes encontrados

Use para verificar se a documentação está atualizada antes de confiar nela.`,
        inputSchema: {
          type: 'object',
          properties: {
            checkOnly: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['hooks', 'pages', 'components', 'all']
              },
              description: 'O que verificar (default: all)'
            }
          }
        }
      },
      {
        name: 'get_dependencies',
        description: `Retorna o mapa de dependências de uma entidade (tabela, hook, componente ou página).
Mostra:
- Quais hooks usam esta entidade
- Quais páginas dependem dela
- Quais componentes a utilizam
- Risco de cascade se modificada

Use para entender o impacto antes de modificar algo.`,
        inputSchema: {
          type: 'object',
          properties: {
            entity: {
              type: 'string',
              description: 'Nome da entidade (ex: "pipeline_stages", "useFieldConfig", "TripInformation")'
            },
            entityType: {
              type: 'string',
              enum: ['table', 'hook', 'component', 'page'],
              description: 'Tipo da entidade'
            }
          },
          required: ['entity', 'entityType']
        }
      }
    ]
  }
})

// Handler para chamadas de ferramentas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'get_context': {
        const result = await getContext(
          args as { task: string; taskType: string; keywords?: string[] },
          projectData
        )
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        }
      }

      case 'check_impact': {
        const result = await checkImpact(
          args as { files: string[]; action: string; description?: string },
          projectData
        )
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        }
      }

      case 'verify_sync': {
        const result = await verifySync(
          args as { checkOnly?: string[] },
          projectData
        )
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        }
      }

      case 'get_dependencies': {
        const result = await getDependencies(
          args as { entity: string; entityType: string },
          projectData
        )
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        }
      }

      default:
        throw new Error(`Ferramenta desconhecida: ${name}`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Erro: ${errorMessage}` }],
      isError: true
    }
  }
})

// Inicia o servidor
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('WelcomeCRM Context MCP Server iniciado')
}

main().catch(console.error)
