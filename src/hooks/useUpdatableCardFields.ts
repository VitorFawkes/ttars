/**
 * Lista os campos do card que uma automação pode atualizar, no workspace e
 * produto atuais. Fonte: catálogo `system_fields` (mesmos campos exibidos nas
 * seções do card), filtrado por:
 *   - org_id = workspace ativo (isolamento por workspace — CLAUDE.md regra #1)
 *   - produto_exclusivo nulo OU = produto atual (isolamento de produto)
 *   - active = true
 *   - isFieldUpdatable(key) → exclui colunas nativas de sistema/ownership/FK
 *
 * Usado pelo editor de Automações (UpdateFieldEditor). O cadence-engine aplica
 * a mesma regra de escrita (NATIVE_WRITABLE_FIELDS / produto_data / bloqueio).
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useProductContext } from '@/hooks/useProductContext'
import { isFieldUpdatable } from '@/lib/automationCardFields'

export interface UpdatableCardField {
    key: string
    label: string
    type: string
    /** Chave técnica da seção (agrupamento) */
    section: string | null
    /** Nome de exibição da seção, igual ao card */
    sectionLabel: string
    options: unknown
}

// Rótulos amigáveis para chaves de seção legadas que não têm linha em `sections`.
const ORPHAN_SECTION_LABELS: Record<string, string> = {
    details: 'Detalhes',
    financial: 'Financeiro',
    geral: 'Geral',
    header: 'Cabeçalho do Card',
    infos_gerais: 'Informações Gerais',
    loss_reason: 'Motivo de Perda',
}

export function useUpdatableCardFields() {
    const { org } = useOrg()
    const activeOrgId = org?.id
    const product = useProductContext((s) => s.currentProduct)

    return useQuery<UpdatableCardField[]>({
        queryKey: ['updatable-card-fields', activeOrgId, product],
        enabled: !!activeOrgId,
        queryFn: async () => {
            if (!activeOrgId) return []
            // Busca campos + catálogo de seções (inclusive inativas, ex: 'system')
            // para resolver o nome de exibição igual ao card.
            const [sfRes, secRes] = await Promise.all([
                supabase
                    .from('system_fields')
                    .select('key, label, type, section, options, produto_exclusivo, active')
                    .eq('org_id', activeOrgId)
                    .eq('active', true),
                supabase.from('sections').select('key, label'),
            ])
            if (sfRes.error) throw sfRes.error
            if (secRes.error) throw secRes.error

            const labelByKey: Record<string, string> = {}
            for (const s of secRes.data || []) {
                const k = s.key as string
                const l = s.label as string
                if (k && l && !labelByKey[k]) labelByKey[k] = l
            }
            const resolveSectionLabel = (key: string | null): string => {
                if (!key) return 'Outros'
                return labelByKey[key] || ORPHAN_SECTION_LABELS[key] || key
            }

            return (sfRes.data || [])
                .filter((f) => !f.produto_exclusivo || f.produto_exclusivo === product)
                .filter((f) => isFieldUpdatable(f.key as string))
                .map((f) => ({
                    key: f.key as string,
                    label: (f.label as string) || (f.key as string),
                    type: (f.type as string) || 'text',
                    section: (f.section as string) ?? null,
                    sectionLabel: resolveSectionLabel((f.section as string) ?? null),
                    options: f.options,
                }))
                .sort(
                    (a, b) =>
                        a.sectionLabel.localeCompare(b.sectionLabel) ||
                        a.label.localeCompare(b.label),
                )
        },
    })
}
