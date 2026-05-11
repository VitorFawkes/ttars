/**
 * Parser para CODEBASE.md
 *
 * Extrai seções, hooks, páginas, tabelas e componentes
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import type {
  CodebaseSection,
  DocumentedHook,
  DocumentedPage,
  DocumentedTable,
  DocumentedComponent
} from '../types.js'

interface ParsedCodebase {
  sections: CodebaseSection[]
  hooks: DocumentedHook[]
  pages: DocumentedPage[]
  tables: DocumentedTable[]
  components: DocumentedComponent[]
  stats: {
    tables: number
    pages: number
    hooks: number
    views: number
    components: number
  }
}

/**
 * Extrai estatísticas do header do CODEBASE.md
 */
function parseStats(content: string): ParsedCodebase['stats'] {
  const statsMatch = content.match(/Stats:\s*(\d+)\s*tabelas\s*\|\s*(\d+)\s*paginas\s*\|\s*(\d+)\s*hooks\s*\|\s*(\d+)\s*views\s*(?:\|\s*(\d+)\s*components)?/i)

  if (statsMatch) {
    return {
      tables: parseInt(statsMatch[1]) || 0,
      pages: parseInt(statsMatch[2]) || 0,
      hooks: parseInt(statsMatch[3]) || 0,
      views: parseInt(statsMatch[4]) || 0,
      components: parseInt(statsMatch[5]) || 0
    }
  }

  return { tables: 0, pages: 0, hooks: 0, views: 0, components: 0 }
}

/**
 * Extrai seções principais do markdown
 */
function parseSections(content: string): CodebaseSection[] {
  const sections: CodebaseSection[] = []
  const lines = content.split('\n')

  let currentSection: CodebaseSection | null = null
  let currentContent: string[] = []

  for (const line of lines) {
    // Detecta header de seção (## )
    const sectionMatch = line.match(/^## (\d+\.?\s*.+)$/)

    if (sectionMatch) {
      // Salva seção anterior
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim()
        sections.push(currentSection)
      }

      // Inicia nova seção
      currentSection = {
        id: sectionMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: sectionMatch[1],
        content: ''
      }
      currentContent = []
    } else if (currentSection) {
      currentContent.push(line)
    }
  }

  // Salva última seção
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim()
    sections.push(currentSection)
  }

  return sections
}

/**
 * Extrai hooks da seção 2.4
 */
function parseHooks(content: string): DocumentedHook[] {
  const hooks: DocumentedHook[] = []

  // Regex para capturar linhas de tabela de hooks
  // | `useHookName()` | `fileName.ts` | Purpose |
  const hookRegex = /\|\s*`?(\w+)\(\)`?\s*\|\s*`?([^|`]+)`?\s*\|\s*([^|]+)\|/g

  let match
  while ((match = hookRegex.exec(content)) !== null) {
    const name = match[1].trim()
    const file = match[2].trim()
    const purpose = match[3].trim()

    // Filtra apenas hooks (começam com "use")
    if (name.startsWith('use')) {
      // Determina categoria baseado no nome/propósito
      let category = 'general'
      if (name.includes('Pipeline') || name.includes('Stage')) category = 'pipeline'
      else if (name.includes('Card')) category = 'cards'
      else if (name.includes('Proposal')) category = 'proposals'
      else if (name.includes('User') || name.includes('Team')) category = 'users'
      else if (name.includes('Field') || name.includes('Section')) category = 'frontend'

      hooks.push({ name, file, purpose, category })
    }
  }

  return hooks
}

/**
 * Extrai páginas da seção 3.3
 */
function parsePages(content: string): DocumentedPage[] {
  const pages: DocumentedPage[] = []

  // Regex para capturar linhas de tabela de páginas
  // | `PageName` | `src/pages/Page.tsx` | `/route` | Description |
  const pageRegex = /\|\s*`?(\w+)`?\s*\|\s*`?([^|`]+)`?\s*\|\s*`?([^|`]+)`?\s*\|\s*([^|]+)\|/g

  let match
  while ((match = pageRegex.exec(content)) !== null) {
    const name = match[1].trim()
    const path = match[2].trim()
    const route = match[3].trim()
    const description = match[4].trim()

    // Filtra apenas páginas (path contém "pages/")
    if (path.includes('pages/') || path.includes('Pages')) {
      // Determina categoria
      let category = 'general'
      if (route.includes('pipeline') || name.includes('Pipeline')) category = 'pipeline'
      else if (route.includes('card') || name.includes('Card')) category = 'cards'
      else if (route.includes('proposal') || name.includes('Proposal')) category = 'proposals'
      else if (route.includes('settings') || route.includes('admin')) category = 'admin'

      pages.push({ name, path, route, description, category })
    }
  }

  return pages
}

/**
 * Extrai tabelas da seção 1
 */
function parseTables(content: string): DocumentedTable[] {
  const tables: DocumentedTable[] = []

  // Regex para capturar tabelas mencionadas
  // - `table_name` (count) → description
  const tableRegex = /[-*]\s*`(\w+)`(?:\s*\([\d,\.]+\))?\s*(?:→|->|—)?\s*([^,\n]+)/g

  let match
  while ((match = tableRegex.exec(content)) !== null) {
    const name = match[1].trim()
    const description = match[2].trim()

    // Determina FKs baseado no contexto
    const fkTo: string[] = []
    if (description.toLowerCase().includes('card')) fkTo.push('cards')
    if (description.toLowerCase().includes('profile') || description.toLowerCase().includes('user')) fkTo.push('profiles')
    if (description.toLowerCase().includes('contact')) fkTo.push('contatos')

    // Determina categoria
    let category = 'general'
    if (name.includes('pipeline') || name.includes('stage')) category = 'pipeline'
    else if (name.includes('proposal')) category = 'proposals'
    else if (name.includes('whatsapp')) category = 'integrations'
    else if (name.includes('integration')) category = 'integrations'
    else if (name.includes('workflow') || name.includes('cadence')) category = 'automation'

    tables.push({ name, description, fkTo, category })
  }

  // Adiciona tabelas core manualmente se não encontradas
  const coreTablesNames = ['cards', 'contatos', 'profiles']
  for (const coreName of coreTablesNames) {
    if (!tables.find(t => t.name === coreName)) {
      tables.push({
        name: coreName,
        description: coreName === 'cards' ? 'Deal/Opportunity' :
                     coreName === 'contatos' ? 'Client/Traveler' : 'CRM User',
        fkTo: [],
        category: 'core'
      })
    }
  }

  return tables
}

/**
 * Extrai componentes da seção 9 e 11
 */
function parseComponents(content: string): DocumentedComponent[] {
  const components: DocumentedComponent[] = []

  // Regex para capturar componentes em tabelas
  // | `ComponentName` | Page | Impact |
  const componentRegex = /\|\s*`?(\w+)`?\s*\|\s*([^|]+)\s*\|\s*([^|]+)\|/g

  // Procura na seção de componentes críticos
  const criticalSection = content.match(/## 9\. Componentes Críticos[\s\S]*?(?=## \d|$)/i)
  const depsSection = content.match(/### 11\.3 Componentes Core[\s\S]*?(?=##|$)/i)

  const sectionsToSearch = [criticalSection?.[0] || '', depsSection?.[0] || ''].join('\n')

  let match
  while ((match = componentRegex.exec(sectionsToSearch)) !== null) {
    const name = match[1].trim()
    const usedIn = match[2].trim().split(',').map(s => s.trim())
    const impact = match[3].trim()

    // Filtra componentes válidos (PascalCase)
    if (name[0] === name[0].toUpperCase() && name.length > 2) {
      // Infere path baseado no nome
      let path = 'src/components/'
      if (name.includes('Card')) path += 'card/'
      else if (name.includes('Pipeline') || name.includes('Kanban')) path += 'pipeline/'
      else if (name.includes('Modal')) path += 'modals/'
      else if (name.includes('Section')) path += 'card/'

      path += `${name}.tsx`

      components.push({ name, path, usedIn, impact })
    }
  }

  // Adiciona componentes críticos conhecidos se não encontrados
  const knownComponents = [
    { name: 'KanbanBoard', path: 'src/components/pipeline/KanbanBoard.tsx', usedIn: ['Pipeline'], impact: 'Todo o fluxo de cards' },
    { name: 'CardHeader', path: 'src/components/card/CardHeader.tsx', usedIn: ['CardDetail'], impact: 'Titulo, fase, owner' },
    { name: 'TripInformation', path: 'src/components/card/TripInformation.tsx', usedIn: ['CardDetail'], impact: 'Dados da viagem' },
    { name: 'CreateCardModal', path: 'src/components/modals/CreateCardModal.tsx', usedIn: ['Pipeline', 'Dashboard'], impact: 'Criação de cards' }
  ]

  for (const known of knownComponents) {
    if (!components.find(c => c.name === known.name)) {
      components.push(known)
    }
  }

  return components
}

/**
 * Função principal: parse CODEBASE.md
 */
export async function parseCodebase(projectRoot: string): Promise<ParsedCodebase> {
  const codebasePath = join(projectRoot, '.agent', 'CODEBASE.md')

  let content: string
  try {
    content = await readFile(codebasePath, 'utf-8')
  } catch {
    console.error('CODEBASE.md não encontrado em:', codebasePath)
    // Retorna estrutura vazia
    return {
      sections: [],
      hooks: [],
      pages: [],
      tables: [],
      components: [],
      stats: { tables: 0, pages: 0, hooks: 0, views: 0, components: 0 }
    }
  }

  const stats = parseStats(content)
  const sections = parseSections(content)
  const hooks = parseHooks(content)
  const pages = parsePages(content)
  const tables = parseTables(content)
  const components = parseComponents(content)

  return {
    sections,
    hooks,
    pages,
    tables,
    components,
    stats
  }
}
