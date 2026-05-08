/**
 * NodeRefLabelsProvider — carrega catálogos (etapas, tags, usuários, fases,
 * tags Echo, motivos de fechamento, templates de cadência) uma única vez no
 * nível da página e expõe maps id→nome via Context. BaseNode usa esses maps
 * pra resolver UUIDs em rótulos humanos no resumo do node.
 *
 * Sem isso, cada um dos N nodes do canvas faria suas próprias queries.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { usePipelinePhases } from '@/hooks/usePipelinePhases'
import { useCardTags } from '@/hooks/useCardTags'
import { useUsers } from '@/hooks/useUsers'
import { useEchoTags, useEchoCloseReasons, useEchoUsers } from '@/hooks/useEchoCatalogs'
import { useCurrentProductMeta } from '@/hooks/useCurrentProductMeta'
import { useProductContext } from '@/hooks/useProductContext'

export interface NodeRefLabels {
    stageById: Map<string, string>
    phaseById: Map<string, string>
    cardTagById: Map<string, string>
    userById: Map<string, string>
    echoTagById: Map<string, string>
    echoUserByProfileId: Map<string, string>
    closeReasonById: Map<string, string>
    cadenceTemplateById: Map<string, string>
}

const EMPTY_LABELS: NodeRefLabels = {
    stageById: new Map(),
    phaseById: new Map(),
    cardTagById: new Map(),
    userById: new Map(),
    echoTagById: new Map(),
    echoUserByProfileId: new Map(),
    closeReasonById: new Map(),
    cadenceTemplateById: new Map(),
}

const NodeRefLabelsContext = createContext<NodeRefLabels>(EMPTY_LABELS)

export function useNodeRefLabels(): NodeRefLabels {
    return useContext(NodeRefLabelsContext)
}

export function NodeRefLabelsProvider({ children }: { children: React.ReactNode }) {
    const { pipelineId } = useCurrentProductMeta()
    const product = useProductContext((s) => s.currentProduct)

    const { data: stages = [] } = usePipelineStages(pipelineId)
    const { data: phases = [] } = usePipelinePhases(pipelineId)
    const { tags: cardTags } = useCardTags(product || undefined)
    const { users } = useUsers()
    const { data: echoTags = [] } = useEchoTags()
    const { data: echoUsers = [] } = useEchoUsers()
    const { data: closeReasons = [] } = useEchoCloseReasons()

    const [cadenceTemplates, setCadenceTemplates] = useState<Array<{ id: string; name: string }>>([])
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(supabase as any)
            .from('cadence_templates')
            .select('id, name')
            .order('name')
            .then(({ data }: { data: Array<{ id: string; name: string }> | null }) =>
                setCadenceTemplates(data || []),
            )
    }, [])

    const labels = useMemo<NodeRefLabels>(() => ({
        stageById: new Map(stages.map((s) => [s.id, s.nome])),
        phaseById: new Map(phases.map((p) => [p.id, p.name])),
        cardTagById: new Map(cardTags.map((t) => [t.id, t.name])),
        userById: new Map(
            (users || [])
                .filter((u) => u.active !== false)
                .map((u) => [u.id, u.nome || u.email || u.id]),
        ),
        echoTagById: new Map(echoTags.map((t) => [t.id, t.name])),
        echoUserByProfileId: new Map(echoUsers.map((u) => [u.profile_id, u.nome])),
        closeReasonById: new Map(closeReasons.map((r) => [r.id, r.name])),
        cadenceTemplateById: new Map(cadenceTemplates.map((t) => [t.id, t.name])),
    }), [stages, phases, cardTags, users, echoTags, echoUsers, closeReasons, cadenceTemplates])

    return (
        <NodeRefLabelsContext.Provider value={labels}>
            {children}
        </NodeRefLabelsContext.Provider>
    )
}
