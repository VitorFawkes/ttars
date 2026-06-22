/**
 * Parser para memory topic files (~/.claude/projects/<proj>/memory/*.md)
 *
 * Indexa as notas de memória do projeto (feedback_*, project_*, topic files)
 * para que get_context possa servi-las — inclusive a SUBAGENTES, que não recebem
 * MEMORY.md/topic files automaticamente. Antes, só o hook inject-topic-context.sh
 * (apenas agente principal) servia a memória; agora o MCP também serve.
 */

import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import matter from 'gray-matter'
import type { MemoryTopic } from '../types.js'

// Palavras irrelevantes para matching (PT + EN). Não viram keyword.
const STOPWORDS = new Set([
  'feedback', 'project', 'memory', 'index', 'status', 'para', 'pelo', 'pela', 'que', 'com',
  'dos', 'das', 'uma', 'nao', 'não', 'sem', 'sempre', 'nunca', 'este', 'esta', 'isso', 'tem',
  'via', 'por', 'sua', 'seu', 'mais', 'como', 'ser', 'projeto', 'regra', 'quando', 'onde',
  'deve', 'todo', 'toda', 'todos', 'todas', 'cada', 'the', 'and', 'for', 'with', 'from', 'this',
  'that', 'must', 'should', 'always', 'never', 'use', 'using', 'are', 'not'
])

/**
 * Tokeniza um texto em keywords (>=4 chars, sem stopwords).
 */
function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9áàâãéêíóôõúüç_\- ]/g, ' ')
    .split(/[\s_\-]+/)
  const kw = new Set<string>()
  for (const t of raw) {
    if (t.length >= 4 && !STOPWORDS.has(t)) kw.add(t)
  }
  return [...kw]
}

async function parseTopicFile(dir: string, file: string): Promise<MemoryTopic | null> {
  try {
    const content = await readFile(join(dir, file), 'utf-8')
    const { data, content: body } = matter(content)
    const name = (data.name as string) || file.replace(/\.md$/, '')
    const description = (data.description as string) || ''
    const excerpt = body
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#'))
      .slice(0, 8)
      .join(' ')
      .slice(0, 400)
    const strongKeywords = tokenize(`${file.replace(/\.md$/, '')} ${name}`)
    const keywords = [...new Set([...strongKeywords, ...tokenize(description)])]
    return {
      file,
      name,
      description,
      keywords,
      strongKeywords,
      excerpt,
    }
  } catch {
    return null
  }
}

/**
 * Resolve o diretório de memória do projeto a partir do projectRoot.
 * Convenção do Claude Code: ~/.claude/projects/<abs-path-com-/-virando-->/memory
 * Ex.: /Users/x/Documents/WelcomeCRM -> -Users-x-Documents-WelcomeCRM
 */
export function resolveMemoryDir(projectRoot: string): string {
  const slug = projectRoot.replace(/\//g, '-')
  return join(homedir(), '.claude', 'projects', slug, 'memory')
}

/**
 * Função principal: indexa todos os topic files da memória do projeto.
 */
export async function parseMemory(projectRoot: string): Promise<MemoryTopic[]> {
  const memoryDir = resolveMemoryDir(projectRoot)
  const topics: MemoryTopic[] = []
  try {
    const files = await readdir(memoryDir)
    const mdFiles = files.filter(
      f => f.endsWith('.md') && f !== 'MEMORY.md' && f !== 'topic-files-index.md'
    )
    for (const file of mdFiles) {
      const topic = await parseTopicFile(memoryDir, file)
      if (topic) topics.push(topic)
    }
  } catch (e) {
    console.error('parseMemory: diretório de memória não acessível:', e)
  }
  return topics
}
