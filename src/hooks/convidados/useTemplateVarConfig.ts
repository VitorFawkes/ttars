import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'

/** Identificadores dos campos arrastáveis no modal "Configurar Envio".
 *  Cada um vira um {{N}} do template depois da resolução por contato. */
export type FieldKey =
  | 'contact.nome'
  | 'contact.sobrenome'
  | 'contact.telefone'
  | 'contact.email'
  | 'card.nome_casal'
  | 'card.codigo_casamento'
  | 'card.local'
  | 'card.data_evento'
  | 'card.site_casamento'
  | 'card.data_final_acao'
  | 'card.link_atendimento'

export interface FieldDescriptor {
  key: FieldKey
  label: string
  group: 'CONTATO' | 'CASAMENTO'
}

export const AVAILABLE_FIELDS: readonly FieldDescriptor[] = [
  // CONTATO
  { key: 'contact.nome',          label: 'Nome',      group: 'CONTATO' },
  { key: 'contact.sobrenome',     label: 'Sobrenome', group: 'CONTATO' },
  { key: 'contact.telefone',      label: 'Telefone',  group: 'CONTATO' },
  { key: 'contact.email',         label: 'Email',     group: 'CONTATO' },
  // CASAMENTO
  { key: 'card.nome_casal',       label: 'Nome do Casal',     group: 'CASAMENTO' },
  { key: 'card.codigo_casamento', label: 'Link do Casal',     group: 'CASAMENTO' },
  { key: 'card.local',            label: 'Local do Evento',   group: 'CASAMENTO' },
  { key: 'card.data_evento',      label: 'Data do Evento',    group: 'CASAMENTO' },
  { key: 'card.site_casamento',   label: 'Site do Casamento', group: 'CASAMENTO' },
  { key: 'card.data_final_acao',  label: 'Data Final Ação',   group: 'CASAMENTO' },
  { key: 'card.link_atendimento', label: 'Link Atendimento',  group: 'CASAMENTO' },
] as const

export interface TemplateVarConfig {
  vars: (FieldKey | null)[]
  buttonVar: FieldKey | null
  phoneNumberId: string | null
}

interface TemplateVarConfigRow {
  id: string
  org_id: string
  template_slug: string
  vars: (FieldKey | null)[] | null
  button_var: FieldKey | null
  phone_number_id: string | null
}

/** Quantidade de variáveis no corpo por slug.
 *  - promom1..promom4 → 6 vars no corpo
 *  - promom5 e os demais (pade1m*, pade2m*) → 5 vars no corpo */
export function getTemplateVarCount(slug: string): number {
  if (slug === 'promom1' || slug === 'promom2' || slug === 'promom3' || slug === 'promom4') return 6
  return 5
}

/** Todos os templates do fluxo têm 1 variável no botão (URL/CTA do convite,
 *  link de RSVP, etc.). Echo aceita `button_parameters` como array opcional —
 *  se o usuário não preencher, mandamos undefined. */
export function hasButtonVar(_slug: string): boolean {
  return true
}

const EMPTY_CONFIG: TemplateVarConfig = { vars: [], buttonVar: null, phoneNumberId: null }

export function useTemplateVarConfig(templateSlug: string | null) {
  const qc = useQueryClient()
  const { org } = useOrg()
  const orgId = org?.id ?? null

  const query = useQuery<TemplateVarConfig>({
    queryKey: ['convidados', 'template-var-config', orgId, templateSlug],
    enabled: !!orgId && !!templateSlug,
    queryFn: async () => {
      if (!orgId || !templateSlug) return EMPTY_CONFIG
      const { data, error } = await sbAny
        .from('template_var_configs')
        .select('id, org_id, template_slug, vars, button_var, phone_number_id')
        .eq('org_id', orgId)
        .eq('template_slug', templateSlug)
        .maybeSingle()
      if (error) throw error
      if (!data) return EMPTY_CONFIG
      const row = data as TemplateVarConfigRow
      return {
        vars: Array.isArray(row.vars) ? row.vars : [],
        buttonVar: row.button_var ?? null,
        phoneNumberId: row.phone_number_id ?? null,
      }
    },
  })

  const saveMut = useMutation({
    mutationFn: async (next: TemplateVarConfig) => {
      if (!orgId || !templateSlug) throw new Error('sem org/template')
      const { error } = await sbAny
        .from('template_var_configs')
        .upsert(
          {
            org_id: orgId,
            template_slug: templateSlug,
            vars: next.vars,
            button_var: next.buttonVar,
            phone_number_id: next.phoneNumberId,
          },
          { onConflict: 'org_id,template_slug' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['convidados', 'template-var-config', orgId, templateSlug] })
    },
  })

  const save = useCallback((next: TemplateVarConfig) => saveMut.mutateAsync(next), [saveMut])

  return {
    config: query.data ?? EMPTY_CONFIG,
    isLoading: query.isLoading,
    save,
    isSaving: saveMut.isPending,
  }
}
