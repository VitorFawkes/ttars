/**
 * Parser para rules (.agent/rules/*.md)
 *
 * Extrai regras obrigatórias do projeto
 */

import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'

interface ParsedRule {
  name: string
  trigger: string
  priority: string
  content: string
}

/**
 * Extrai o conteúdo resumido da regra
 */
function extractRuleContent(body: string): string {
  // Pega as primeiras 500 caracteres relevantes
  const lines = body.split('\n').filter(l => l.trim() && !l.startsWith('#'))
  return lines.slice(0, 20).join('\n').substring(0, 500)
}

/**
 * Parseia um único arquivo de rule
 */
async function parseRuleFile(filePath: string): Promise<ParsedRule | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const { data: frontmatter, content: body } = matter(content)

    const fileName = filePath.split('/').pop()?.replace('.md', '') || 'unknown'
    const name = fileName

    const trigger = frontmatter.trigger as string || 'manual'
    const priority = frontmatter.priority as string || 'P1'

    const ruleContent = extractRuleContent(body)

    return {
      name,
      trigger,
      priority,
      content: ruleContent
    }
  } catch (error) {
    console.error(`Erro ao parsear rule ${filePath}:`, error)
    return null
  }
}

/**
 * Função principal: parse todas as rules
 */
export async function parseRules(projectRoot: string): Promise<ParsedRule[]> {
  const rulesDir = join(projectRoot, '.agent', 'rules')
  const rules: ParsedRule[] = []

  try {
    const files = await readdir(rulesDir)
    const mdFiles = files.filter(f => f.endsWith('.md')).sort()

    for (const file of mdFiles) {
      const filePath = join(rulesDir, file)
      const rule = await parseRuleFile(filePath)

      if (rule) {
        rules.push(rule)
      }
    }
  } catch (error) {
    console.error('Erro ao listar rules:', error)
  }

  // Garante regras essenciais
  const essentialRules = [
    { name: '00-project-context', trigger: 'always_on', priority: 'P0', content: 'Contexto do projeto: IDs Supabase, stack tech' },
    { name: '01-mandatory-context', trigger: 'always_on', priority: 'P0', content: 'Protocolo de entrada/saída obrigatório' }
  ]

  for (const essential of essentialRules) {
    if (!rules.find(r => r.name === essential.name)) {
      rules.push(essential)
    }
  }

  return rules
}
