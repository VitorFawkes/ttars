/**
 * Parser para agents (.agent/agents/*.md)
 *
 * Extrai informações dos agentes especializados
 */

import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import type { AgentInfo } from '../types.js'

/**
 * Extrai regras-chave do conteúdo do agent
 */
function extractKeyRules(content: string): string[] {
  const rules: string[] = []

  // Procura por padrões comuns de regras
  const rulePatterns = [
    /❌\s*(?:NEVER|Don't|Não)\s+([^\n]+)/gi,
    /✅\s*(?:ALWAYS|Always|Sempre)\s+([^\n]+)/gi,
    /🚫\s*([^\n]+)/g,
    /⛔\s*([^\n]+)/g,
    /\*\*NEVER\*\*:?\s*([^\n]+)/gi,
    /\*\*ALWAYS\*\*:?\s*([^\n]+)/gi
  ]

  for (const pattern of rulePatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const rule = match[1].trim()
      if (rule.length > 10 && rule.length < 200) {
        rules.push(rule)
      }
    }
  }

  return [...new Set(rules)].slice(0, 10) // Max 10 regras
}

/**
 * Extrai triggers (palavras que ativam o agent)
 */
function extractTriggers(frontmatter: Record<string, unknown>, name: string): string[] {
  // Tenta pegar do frontmatter
  if (frontmatter.triggers && Array.isArray(frontmatter.triggers)) {
    return frontmatter.triggers
  }

  // Infere do nome do agent
  const triggerMap: Record<string, string[]> = {
    'frontend-specialist': ['react', 'component', 'componente', 'ui', 'ux', 'página', 'page', 'tailwind', 'css'],
    'backend-specialist': ['api', 'edge function', 'endpoint', 'webhook', 'rpc'],
    'database-architect': ['sql', 'tabela', 'table', 'view', 'trigger', 'migration', 'rls'],
    'debugger': ['bug', 'erro', 'error', 'debug', 'investigar', 'problema'],
    'project-planner': ['planejar', 'plan', 'feature', 'roadmap', 'brainstorm'],
    'security-auditor': ['segurança', 'security', 'vulnerabilidade', 'rls', 'policy'],
    'performance-optimizer': ['performance', 'lento', 'slow', 'otimizar', 'optimize'],
    'test-engineer': ['teste', 'test', 'spec', 'coverage', 'vitest', 'playwright'],
  }

  return triggerMap[name] || []
}

/**
 * Parseia um único arquivo de agent
 */
async function parseAgentFile(filePath: string): Promise<AgentInfo | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const { data: frontmatter, content: body } = matter(content)

    const name = frontmatter.name as string ||
                 filePath.split('/').pop()?.replace('.md', '') ||
                 'unknown'

    const description = frontmatter.description as string || ''

    // Extrai skills do frontmatter
    const skillsRaw = frontmatter.skills
    let skills: string[] = []
    if (typeof skillsRaw === 'string') {
      skills = skillsRaw.split(',').map(s => s.trim())
    } else if (Array.isArray(skillsRaw)) {
      skills = skillsRaw
    }

    const keyRules = extractKeyRules(body)
    const triggers = extractTriggers(frontmatter, name)

    return {
      name,
      description,
      skills,
      keyRules,
      triggers
    }
  } catch (error) {
    console.error(`Erro ao parsear agent ${filePath}:`, error)
    return null
  }
}

/**
 * Função principal: parse todos os agents
 */
export async function parseAgents(projectRoot: string): Promise<Record<string, AgentInfo>> {
  const agentsDir = join(projectRoot, '.agent', 'agents')
  const agents: Record<string, AgentInfo> = {}

  try {
    const files = await readdir(agentsDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))

    for (const file of mdFiles) {
      const filePath = join(agentsDir, file)
      const agent = await parseAgentFile(filePath)

      if (agent) {
        agents[agent.name] = agent
      }
    }
  } catch (error) {
    console.error('Erro ao listar agents:', error)
  }

  // Garante que agents essenciais existam
  const essentialAgents = ['frontend-specialist', 'backend-specialist', 'database-architect', 'debugger']
  for (const name of essentialAgents) {
    if (!agents[name]) {
      agents[name] = {
        name,
        description: `${name} agent`,
        skills: [],
        keyRules: [],
        triggers: extractTriggers({}, name)
      }
    }
  }

  return agents
}
