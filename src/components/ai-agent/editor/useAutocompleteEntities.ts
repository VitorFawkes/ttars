import { useMemo } from 'react'
import { useCRMFields, type CRMField, type FieldScope } from './CRMFieldPicker'
import { useCardTags } from '@/hooks/useCardTags'
import { useAiSkills } from '@/hooks/useAiSkills'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { useAiAgentDetail } from '@/hooks/useAiAgents'

export type EntityType = 'field' | 'tag' | 'skill' | 'stage'

export interface AutocompleteEntity {
  type: EntityType
  /** Identificador único dentro do tipo. Usado tanto pra render quanto pra busca. */
  id: string
  /** Rótulo amigável (ex: "Data do Casamento", "Família co-financiadora"). */
  label: string
  /** Descrição secundária mostrada em cinza (ex: a key técnica pra campo). */
  sublabel?: string
  /** Agrupador visual dentro do dropdown. */
  section: string
}

interface Args {
  enabledTypes: EntityType[]
  pipelineId?: string
  produto?: string
  agentId?: string
  fieldScope?: FieldScope
}

export function useAutocompleteEntities({
  enabledTypes,
  pipelineId,
  produto,
  agentId,
  fieldScope = 'any',
}: Args) {
  const fieldsResult = useCRMFields({ scope: fieldScope, pipelineId, produto })
  const cardTagsResult = useCardTags(produto)
  const { skills: allSkills } = useAiSkills()
  const { data: stages } = usePipelineStages(pipelineId)
  const { data: agentDetail } = useAiAgentDetail(agentId)

  // Skills atribuídas ao agente (prioridade) — se não tiver, usa todas da org.
  const assignedSkills = useMemo(() => {
    const src = (agentDetail as unknown as { ai_agent_skills?: Array<{ ai_skills?: import('@/hooks/useAiSkills').AiSkill | null; enabled?: boolean }> } | null)
    const rows = src?.ai_agent_skills ?? []
    const enabled = rows.filter(r => r.enabled && r.ai_skills).map(r => r.ai_skills!)
    return enabled.length > 0 ? enabled : allSkills
  }, [agentDetail, allSkills])

  const entities = useMemo<AutocompleteEntity[]>(() => {
    const out: AutocompleteEntity[] = []

    if (enabledTypes.includes('field')) {
      for (const f of fieldsResult.fields as CRMField[]) {
        out.push({
          type: 'field',
          id: f.key,
          label: f.label,
          sublabel: f.key,
          section: `Campos — ${f.sectionLabel}`,
        })
      }
    }

    if (enabledTypes.includes('tag')) {
      for (const t of cardTagsResult.tags) {
        out.push({
          type: 'tag',
          id: t.name,
          label: t.name,
          section: 'Tags',
        })
      }
    }

    if (enabledTypes.includes('skill')) {
      for (const s of assignedSkills) {
        out.push({
          type: 'skill',
          id: s.nome,
          label: s.nome,
          sublabel: s.descricao ?? undefined,
          section: 'Ferramentas (Skills)',
        })
      }
    }

    if (enabledTypes.includes('stage') && stages) {
      // `usePipelineStages(pipelineId)` já filtra só etapas ativas por default.
      for (const s of stages) {
        out.push({
          type: 'stage',
          id: s.nome,
          label: s.nome,
          sublabel: `Etapa ${s.ordem}`,
          section: 'Etapas do pipeline',
        })
      }
    }

    return out
  }, [enabledTypes, fieldsResult.fields, cardTagsResult.tags, assignedSkills, stages])

  return {
    entities,
    isLoading: fieldsResult.isLoading || cardTagsResult.isLoading,
  }
}

/**
 * Converte uma entidade selecionada na string que deve ser inserida no texto.
 * - field: a key raw (ex: `ww_data_casamento`) — o LLM já reconhece por padrão.
 * - tag/skill/stage: token estruturado `@[tipo:valor]` que vira chip colorido.
 */
export function entityToInsertString(e: AutocompleteEntity): string {
  if (e.type === 'field') return e.id
  const prefix = e.type === 'tag' ? 'tag' : e.type === 'skill' ? 'skill' : 'etapa'
  return `@[${prefix}:${e.id}]`
}
