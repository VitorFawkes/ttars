/**
 * Loader - Carrega dados parseados ou faz parse on-demand
 */

import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { ParsedProjectData } from '../types.js'
import { parseCodebase } from './parse-codebase.js'
import { parseAgents } from './parse-agents.js'
import { parseRules } from './parse-rules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, '..', 'data', 'project-data.json')

/**
 * Encontra o diretório raiz do projeto WelcomeCRM
 */
function findProjectRoot(): string {
  // Se estamos em mcp-servers/welcomecrm-context, subimos 2 níveis
  let current = process.cwd()

  // Verifica se já estamos no root do projeto
  if (existsSync(join(current, 'CLAUDE.md'))) {
    return current
  }

  // Tenta subir até encontrar
  for (let i = 0; i < 5; i++) {
    current = dirname(current)
    if (existsSync(join(current, 'CLAUDE.md'))) {
      return current
    }
  }

  // Fallback: assume estrutura padrão
  return join(__dirname, '..', '..', '..', '..')
}

/**
 * Carrega dados do projeto (do cache ou parseando)
 */
export async function loadProjectData(): Promise<ParsedProjectData> {
  // Tenta carregar dados cacheados
  if (existsSync(DATA_FILE)) {
    try {
      const cached = JSON.parse(await readFile(DATA_FILE, 'utf-8'))

      // Verifica se cache é recente (menos de 1 hora)
      const cacheAge = Date.now() - new Date(cached.lastParsed).getTime()
      const ONE_HOUR = 60 * 60 * 1000

      if (cacheAge < ONE_HOUR) {
        console.error('Usando dados cacheados')
        return cached
      }
    } catch {
      console.error('Cache inválido, fazendo parse')
    }
  }

  // Faz parse dos arquivos
  console.error('Parseando arquivos do projeto...')
  const projectRoot = findProjectRoot()

  const [codebase, agents, rules] = await Promise.all([
    parseCodebase(projectRoot),
    parseAgents(projectRoot),
    parseRules(projectRoot)
  ])

  const projectData: ParsedProjectData = {
    agents,
    codebase,
    rules,
    lastParsed: new Date().toISOString()
  }

  // Salva cache (best effort)
  try {
    const { writeFile, mkdir } = await import('fs/promises')
    await mkdir(dirname(DATA_FILE), { recursive: true })
    await writeFile(DATA_FILE, JSON.stringify(projectData, null, 2))
    console.error('Cache salvo')
  } catch (e) {
    console.error('Não foi possível salvar cache:', e)
  }

  return projectData
}

/**
 * Força reparse dos dados
 */
export async function forceReparse(): Promise<ParsedProjectData> {
  const { unlink } = await import('fs/promises')

  // Remove cache
  try {
    await unlink(DATA_FILE)
  } catch {
    // Ignora se não existir
  }

  return loadProjectData()
}
