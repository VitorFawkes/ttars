import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../contexts/AuthContext'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'
import type { WeddingGroup } from '../../components/convidados/import/parseXlsx'

/** Para cada grupo da planilha, decisão do usuário no passo de matching. */
export type MatchAction =
  | { kind: 'create' }
  | { kind: 'update', cardId: string, fillBlank: boolean }
  | { kind: 'use', cardId: string } // só anexa convidados, não altera card
  | { kind: 'skip' }

export interface GroupPlan {
  group: WeddingGroup
  action: MatchAction
}

export interface ImportProgress {
  current: number
  total: number
  label: string
}

export interface GroupResult {
  codigo: string
  titulo: string
  cardId: string | null
  cardCreated: boolean
  cardUpdated: boolean
  guestsCreated: number
  guestsSkippedDup: number
  rowErrors: { rowIndex: number, message: string }[]
}

export interface ImportSummary {
  cardsCreated: number
  cardsUpdated: number
  guestsCreated: number
  guestsSkipped: number
  results: GroupResult[]
}

const POS_VENDA_PHASE_SLUG = 'pos_venda'

/** Resolve a org onde o contato deve viver. Com sharing ligado, é a account pai. */
async function resolveContatoOrgId(currentOrgId: string): Promise<string> {
  const { data, error } = await sbAny
    .from('organizations')
    .select('id, parent_org_id, shares_contacts_with_children')
    .eq('id', currentOrgId)
    .single()
  if (error || !data) return currentOrgId
  if (data.parent_org_id) {
    const { data: parent } = await sbAny
      .from('organizations')
      .select('id, shares_contacts_with_children')
      .eq('id', data.parent_org_id)
      .single()
    if (parent?.shares_contacts_with_children) return parent.id as string
  }
  return data.id as string
}

interface FindOrCreateContatoArgs {
  accountOrgId: string
  nome: string
  sobrenome: string | null
  email: string | null
  telefoneNorm: string | null
  telefoneRaw: string | null
  createdBy: string | null
}

async function findOrCreateContato(args: FindOrCreateContatoArgs): Promise<string> {
  const { accountOrgId, nome, sobrenome, email, telefoneNorm, telefoneRaw, createdBy } = args

  if (email) {
    const { data, error } = await sbAny
      .from('contatos')
      .select('id')
      .eq('org_id', accountOrgId)
      .eq('email', email)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (data?.id) return data.id as string
  }

  if (telefoneNorm) {
    const { data, error } = await sbAny
      .from('contatos')
      .select('id')
      .eq('org_id', accountOrgId)
      .eq('telefone_normalizado', telefoneNorm)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (data?.id) return data.id as string
  }

  const payload: Record<string, unknown> = {
    nome,
    sobrenome: sobrenome ?? '—',
    org_id: accountOrgId,
    email,
    telefone: telefoneRaw,
    created_by: createdBy,
    origem: 'convidados_import_xlsx',
  }
  const { data, error } = await sbAny
    .from('contatos')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505' && email) {
      const { data: existing } = await sbAny
        .from('contatos')
        .select('id')
        .eq('org_id', accountOrgId)
        .eq('email', email)
        .is('deleted_at', null)
        .maybeSingle()
      if (existing?.id) return existing.id as string
    }
    throw error
  }
  return data.id as string
}

/** Constrói o `produto_data` de um card novo a partir das colunas F–M. */
function buildProdutoDataNew(group: WeddingGroup): Record<string, unknown> {
  const data: Record<string, unknown> = { codigo_casamento: group.codigo }
  if (group.local) data.ww_local = group.local
  if (group.site_casamento) data.ww_site_casamento = group.site_casamento
  if (group.data_final_acao_iso) data.ww_data_final_acao = group.data_final_acao_iso
  if (group.link_atendimento) data.ww_link_atendimento = group.link_atendimento
  return data
}

/** Patch só com as chaves cujo valor atual no produto_data é null/undefined/''. */
function buildProdutoDataFillBlank(
  group: WeddingGroup,
  existing: Record<string, unknown> | null,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const cur = existing ?? {}

  const isBlank = (v: unknown) =>
    v == null || (typeof v === 'string' && v.trim().length === 0)

  if (isBlank(cur.codigo_casamento)) patch.codigo_casamento = group.codigo
  if (group.local && isBlank(cur.ww_local)) patch.ww_local = group.local
  if (group.site_casamento && isBlank(cur.ww_site_casamento)) patch.ww_site_casamento = group.site_casamento
  if (group.data_final_acao_iso && isBlank(cur.ww_data_final_acao)) patch.ww_data_final_acao = group.data_final_acao_iso
  if (group.link_atendimento && isBlank(cur.ww_link_atendimento)) patch.ww_link_atendimento = group.link_atendimento
  return patch
}

interface RunArgs {
  plans: GroupPlan[]
  orgId: string
  pipelineId: string
  posVendaFirstStageId: string
  accountOrgId: string
  createdBy: string | null
  onProgress: (p: ImportProgress) => void
}

async function runImport(args: RunArgs): Promise<ImportSummary> {
  const { plans, orgId, pipelineId, posVendaFirstStageId, accountOrgId, createdBy, onProgress } = args

  const totalSteps = plans.reduce((acc, p) => acc + 1 + p.group.guests.length, 0)
  let step = 0
  const advance = (label: string) => {
    step++
    onProgress({ current: step, total: totalSteps, label })
  }

  const results: GroupResult[] = []
  let cardsCreated = 0
  let cardsUpdated = 0
  let guestsCreatedTotal = 0
  let guestsSkippedTotal = 0

  for (let pi = 0; pi < plans.length; pi++) {
    const plan = plans[pi]
    const { group, action } = plan
    const groupLabel = `Casamento ${pi + 1}/${plans.length}: ${group.titulo}`

    if (action.kind === 'skip') {
      advance(`${groupLabel} — pulado`)
      // Avança os steps dos convidados pulados também
      for (let g = 0; g < group.guests.length; g++) advance(groupLabel)
      results.push({
        codigo: group.codigo,
        titulo: group.titulo,
        cardId: null,
        cardCreated: false,
        cardUpdated: false,
        guestsCreated: 0,
        guestsSkippedDup: 0,
        rowErrors: [],
      })
      continue
    }

    advance(`${groupLabel} — preparando card`)
    let targetCardId: string
    let cardCreated = false
    let cardUpdated = false

    if (action.kind === 'create') {
      const produtoData: Record<string, unknown> = {
        ...buildProdutoDataNew(group),
        imported_at: new Date().toISOString(),
      }
      const insertPayload: Record<string, unknown> = {
        titulo: group.titulo,
        produto: 'WEDDING',
        org_id: orgId,
        pipeline_id: pipelineId,
        pipeline_stage_id: posVendaFirstStageId,
        produto_data: produtoData,
      }
      if (group.data_evento_iso) {
        insertPayload.data_viagem_inicio = group.data_evento_iso
      }
      const { data, error } = await sbAny
        .from('cards')
        .insert(insertPayload)
        .select('id')
        .single()
      if (error) throw error
      targetCardId = data.id as string
      cardCreated = true
      cardsCreated++
    } else if (action.kind === 'update') {
      targetCardId = action.cardId
      if (action.fillBlank) {
        const { data: cur, error: curErr } = await sbAny
          .from('cards')
          .select('produto_data, data_viagem_inicio')
          .eq('id', targetCardId)
          .single()
        if (curErr) throw curErr
        const existingData = (cur?.produto_data ?? null) as Record<string, unknown> | null
        const patch = buildProdutoDataFillBlank(group, existingData)
        const updatePayload: Record<string, unknown> = {}
        if (Object.keys(patch).length > 0) {
          updatePayload.produto_data = { ...(existingData ?? {}), ...patch }
        }
        if (group.data_evento_iso && !cur?.data_viagem_inicio) {
          updatePayload.data_viagem_inicio = group.data_evento_iso
        }
        if (Object.keys(updatePayload).length > 0) {
          const { error: updErr } = await sbAny
            .from('cards')
            .update(updatePayload)
            .eq('id', targetCardId)
          if (updErr) throw updErr
          cardUpdated = true
          cardsUpdated++
        }
      }
    } else {
      // 'use' — só anexa convidados ao card existente, sem alterar card.
      targetCardId = action.cardId
    }

    // Insere convidados. Reusa lógica de findOrCreateContato + insert em
    // wedding_guests (status_rsvp nasce 'sem_reacao' por default do banco).
    let guestsCreated = 0
    let guestsSkippedDup = 0
    const rowErrors: { rowIndex: number, message: string }[] = []

    for (const guest of group.guests) {
      advance(`${groupLabel} — convidado ${guest.nome}`)
      if (guest.errors.length > 0) {
        rowErrors.push({ rowIndex: guest.rowIndex, message: guest.errors.join(', ') })
        continue
      }
      try {
        const contatoId = await findOrCreateContato({
          accountOrgId,
          nome: guest.nome,
          sobrenome: guest.sobrenome,
          email: guest.email,
          telefoneNorm: guest.telefoneNorm,
          telefoneRaw: guest.telefone,
          createdBy,
        })
        const { error: linkErr } = await sbAny.from('wedding_guests').insert({
          card_id: targetCardId,
          contato_id: contatoId,
          created_by: createdBy,
        })
        if (linkErr) {
          if (linkErr.code === '23505') {
            guestsSkippedDup++
          } else {
            rowErrors.push({ rowIndex: guest.rowIndex, message: linkErr.message })
          }
        } else {
          guestsCreated++
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        rowErrors.push({ rowIndex: guest.rowIndex, message: msg })
      }
    }

    guestsCreatedTotal += guestsCreated
    guestsSkippedTotal += guestsSkippedDup

    results.push({
      codigo: group.codigo,
      titulo: group.titulo,
      cardId: targetCardId,
      cardCreated,
      cardUpdated,
      guestsCreated,
      guestsSkippedDup,
      rowErrors,
    })
  }

  return {
    cardsCreated,
    cardsUpdated,
    guestsCreated: guestsCreatedTotal,
    guestsSkipped: guestsSkippedTotal,
    results,
  }
}

interface CardCandidate {
  id: string
  titulo: string
  produto_data: Record<string, unknown> | null
}

/** Normaliza título de casamento para comparação fuzzy (remove acentos, "DW |",
 *  espaços extras, "&"/"and"). Igual ao normTitle do script de import. */
function normTitle(s: string): string {
  let v = s.normalize('NFKD').replace(/[̀-ͯ]/g, '')
  v = v.toLowerCase().trim()
  v = v.replace(/^dw\s*\|\s*/i, '')
  v = v.replace(/\s+(&|e|and)\s+/g, ' ')
  v = v.replace(/\s+/g, ' ').trim()
  return v
}

export interface CardMatchSuggestion {
  byCodigo: CardCandidate | null
  byTitle: CardCandidate[]
}

/** Para um grupo da planilha, busca cards WEDDING desta org que casem por
 *  codigo_casamento (preferência) ou por título normalizado. */
export async function findCardMatches(
  orgId: string,
  group: WeddingGroup,
): Promise<CardMatchSuggestion> {
  // 1) Match exato por codigo_casamento dentro do produto_data.
  const { data: byCodigoData, error: codErr } = await sbAny
    .from('cards')
    .select('id, titulo, produto_data')
    .eq('org_id', orgId)
    .eq('produto', 'WEDDING')
    .is('deleted_at', null)
    .eq('produto_data->>codigo_casamento', group.codigo)
    .limit(1)
  if (codErr) throw codErr
  const byCodigo = (byCodigoData?.[0] ?? null) as CardCandidate | null

  if (byCodigo) return { byCodigo, byTitle: [] }

  // 2) Fallback por título normalizado. Faz busca grossa por LIKE com a
  // primeira palavra significativa do título e filtra no cliente.
  const titleNorm = normTitle(group.titulo)
  if (!titleNorm) return { byCodigo: null, byTitle: [] }
  const firstWord = titleNorm.split(' ')[0]
  const { data: titleData, error: titleErr } = await sbAny
    .from('cards')
    .select('id, titulo, produto_data')
    .eq('org_id', orgId)
    .eq('produto', 'WEDDING')
    .is('deleted_at', null)
    .ilike('titulo', `%${firstWord}%`)
    .limit(20)
  if (titleErr) throw titleErr
  const candidates = ((titleData ?? []) as CardCandidate[]).filter(c => normTitle(c.titulo) === titleNorm)
  return { byCodigo: null, byTitle: candidates }
}

/** Resolve a primeira stage da fase 'pos_venda' do pipeline WEDDING desta org. */
export async function getPosVendaFirstStageId(orgId: string, pipelineId: string): Promise<string | null> {
  const { data: phase, error: phaseErr } = await sbAny
    .from('pipeline_phases')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', POS_VENDA_PHASE_SLUG)
    .maybeSingle()
  if (phaseErr) throw phaseErr
  if (!phase?.id) return null

  const { data: stages, error: stageErr } = await sbAny
    .from('pipeline_stages')
    .select('id, ordem')
    .eq('phase_id', phase.id)
    .eq('pipeline_id', pipelineId)
    .order('ordem', { ascending: true })
    .limit(1)
  if (stageErr) throw stageErr
  const first = (stages ?? [])[0] as { id: string } | undefined
  return first?.id ?? null
}

export function useImportarCasamento() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const { org } = useOrg()
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [running, setRunning] = useState(false)

  const execute = useCallback(async (plans: GroupPlan[]): Promise<ImportSummary> => {
    if (!org?.id) throw new Error('Sem organização ativa')
    setRunning(true)
    setProgress({ current: 0, total: 1, label: 'Preparando…' })
    try {
      // Resolve pipeline WEDDING + stage de pos_venda dinamicamente.
      const { data: pipelineRow, error: pipeErr } = await sbAny
        .from('pipelines')
        .select('id')
        .eq('org_id', org.id)
        .eq('produto', 'WEDDING')
        .maybeSingle()
      if (pipeErr) throw pipeErr
      const pipelineId = pipelineRow?.id as string | undefined
      if (!pipelineId) throw new Error('Pipeline WEDDING não encontrado nesta organização')

      const posVendaStageId = await getPosVendaFirstStageId(org.id, pipelineId)
      if (!posVendaStageId) throw new Error('Stage pos_venda não encontrada no pipeline WEDDING')

      const accountOrgId = await resolveContatoOrgId(org.id)

      const summary = await runImport({
        plans,
        orgId: org.id,
        pipelineId,
        posVendaFirstStageId: posVendaStageId,
        accountOrgId,
        createdBy: profile?.id ?? null,
        onProgress: setProgress,
      })
      // Invalida queries do módulo Convidados pra refletir o que entrou.
      queryClient.invalidateQueries({ queryKey: ['convidados'] })
      return summary
    } finally {
      setRunning(false)
    }
  }, [org?.id, profile?.id, queryClient])

  return { execute, progress, running }
}
