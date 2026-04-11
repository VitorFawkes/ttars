import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'

export interface WizardStep1 {
  company_name: string
  company_description: string
  agent_name: string
  agent_persona: string
  tone: string
  language: string
  produto: string
}

export interface WizardStep2 {
  template_id: string
}

export interface QualificationStage {
  stage_name: string
  stage_key: string
  question: string
  subquestions: string[]
  disqualification_triggers: Array<{ trigger: string; message: string }>
  advance_to_stage_id: string
  advance_condition: string
  response_options: string[]
}

export interface WizardStep3 {
  stages: QualificationStage[]
}

export interface KbItem {
  titulo: string
  conteudo: string
  tags: string[]
}

export interface WizardStep4 {
  kb_items: KbItem[]
  kb_name: string
}

export interface SpecialScenario {
  scenario_name: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  response_adjustment: string
  skip_fee_presentation: boolean
  skip_meeting_scheduling: boolean
  auto_assign_tag: string
  handoff_message: string
}

export interface WizardStep5 {
  pricing_model: string
  pricing_json: Record<string, unknown>
  fee_presentation_timing: string
  process_steps: string[]
  methodology_text: string
  has_secondary_contacts: boolean
  secondary_contact_role_name: string
  secondary_contact_fields: string[]
  special_scenarios: SpecialScenario[]
  form_data_fields: string[]
  protected_fields: string[]
  calendar_system: string
  calendar_config: Record<string, unknown>
}

export interface WizardStep6 {
  escalation_rules: Array<Record<string, unknown>>
  escalation_triggers: Array<Record<string, unknown>>
  fallback_message: string
}

export interface WizardStep7 {
  phone_line_id: string
  go_live: boolean
}

export interface WizardData {
  step1: Partial<WizardStep1>
  step2: Partial<WizardStep2>
  step3: Partial<WizardStep3>
  step4: Partial<WizardStep4>
  step5: Partial<WizardStep5>
  step6: Partial<WizardStep6>
  step7: Partial<WizardStep7>
}

const EMPTY_WIZARD: WizardData = {
  step1: { tone: 'professional', language: 'pt-BR', produto: 'trips' },
  step2: {},
  step3: { stages: [] },
  step4: { kb_items: [], kb_name: '' },
  step5: {
    pricing_model: 'flat',
    pricing_json: {},
    fee_presentation_timing: 'after_qualification',
    process_steps: [],
    methodology_text: '',
    has_secondary_contacts: false,
    special_scenarios: [],
    form_data_fields: [],
    protected_fields: ['pessoa_principal_id', 'produto_data', 'valor_estimado'],
    calendar_system: 'none',
  },
  step6: { escalation_rules: [], escalation_triggers: [], fallback_message: '' },
  step7: { go_live: false },
}

export function useAgentWizard(draftId?: string, orgId?: string) {
  const [currentStep, setCurrentStep] = useState(1)
  const [wizardData, setWizardData] = useState<WizardData>(EMPTY_WIZARD)
  const [draftSavedId, setDraftSavedId] = useState<string | undefined>(draftId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Carregar draft existente
  useQuery({
    queryKey: ['ai-wizard-draft', draftId],
    queryFn: async () => {
      if (!draftId) return null
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('ai_agent_wizard_drafts' as any)
        .select('*')
        .eq('id', draftId)
        .single()

      const row = data as Record<string, unknown> | null
      if (row) {
        setWizardData(row.step_data as WizardData || EMPTY_WIZARD)
        setCurrentStep((row.current_step as number) || 1)
      }
      return data
    },
    enabled: !!draftId,
  })

  // Atualizar step data
  const updateStep = useCallback(<K extends keyof WizardData>(
    stepKey: K,
    data: Partial<WizardData[K]>,
  ) => {
    setWizardData((prev) => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], ...data },
    }))
  }, [])

  // Salvar draft
  const saveDraft = useMutation({
    mutationFn: async () => {
      if (draftSavedId) {
        await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('ai_agent_wizard_drafts' as any)
          .update({
            current_step: currentStep,
            step_data: wizardData as unknown as Record<string, unknown>,
            template_id: wizardData.step2?.template_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', draftSavedId)
      } else {
        const { data } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('ai_agent_wizard_drafts' as any)
          .insert({
            current_step: currentStep,
            step_data: wizardData as unknown as Record<string, unknown>,
            template_id: wizardData.step2?.template_id || null,
          })
          .select('id')
          .single()

        if (data) setDraftSavedId((data as unknown as Record<string, unknown>).id as string)
      }
    },
  })

  // Submeter wizard (criar agente)
  const submitWizard = useMutation({
    mutationFn: async () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const serviceKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const res = await fetch(`${supabaseUrl}/functions/v1/ai-agent-from-wizard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          template_id: wizardData.step2?.template_id,
          wizard_data: wizardData,
          draft_id: draftSavedId,
          org_id: orgId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create agent')
      }

      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] })
      navigate(`/settings/ai-agents/${data.agent_id}`)
    },
  })

  const goNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, 7))
    saveDraft.mutate()
  }, [saveDraft])

  const goBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 1))
  }, [])

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.max(1, Math.min(7, step)))
  }, [])

  return {
    currentStep,
    wizardData,
    updateStep,
    goNext,
    goBack,
    goToStep,
    saveDraft,
    submitWizard,
    draftId: draftSavedId,
  }
}
