import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { BusinessConfigEditor } from './BusinessConfigEditor'
import {
  useAgentBusinessConfig,
  DEFAULT_BUSINESS_CONFIG,
  type BusinessConfigInput,
  type BusinessConfig,
} from '@/hooks/useAgentBusinessConfig'

interface Props {
  agentId: string | undefined
}

function fromRemote(c: BusinessConfig | null): BusinessConfigInput {
  if (!c) return { ...DEFAULT_BUSINESS_CONFIG }
  return {
    company_name: c.company_name,
    company_description: c.company_description,
    tone: c.tone,
    language: c.language,
    pricing_model: c.pricing_model,
    pricing_json: c.pricing_json,
    fee_presentation_timing: c.fee_presentation_timing,
    process_steps: c.process_steps,
    methodology_text: c.methodology_text,
    calendar_system: c.calendar_system,
    calendar_config: c.calendar_config,
    protected_fields: c.protected_fields,
    auto_update_fields: c.auto_update_fields,
    contact_update_fields: c.contact_update_fields,
    form_data_fields: c.form_data_fields,
    has_secondary_contacts: c.has_secondary_contacts,
    secondary_contact_role_name: c.secondary_contact_role_name,
    secondary_contact_fields: c.secondary_contact_fields,
    escalation_triggers: c.escalation_triggers,
    custom_blocks: c.custom_blocks ?? [],
  }
}

export function TabRegrasNegocio({ agentId }: Props) {
  const { config, isLoading, upsert } = useAgentBusinessConfig(agentId)
  const [local, setLocal] = useState<BusinessConfigInput>(DEFAULT_BUSINESS_CONFIG)
  const [dirty, setDirty] = useState(false)

  // Carrega local a partir do servidor (derive-from-props). Após save, React Query invalida
  // e re-sincroniza. Pattern estabelecida no AiAgentDetailPage desta mesma pasta.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derive local state from server data
    setLocal(fromRemote(config))
    setDirty(false)
  }, [config])

  const handleChange = (next: BusinessConfigInput) => {
    setLocal(next)
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      await upsert.mutateAsync(local)
      toast.success('Regras de negócio salvas')
      setDirty(false)
    } catch (err) {
      toast.error('Erro ao salvar regras')
      console.error(err)
    }
  }

  if (!agentId) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <p className="text-sm text-slate-500">Salve o agente primeiro para configurar as regras de negócio.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando regras...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BusinessConfigEditor value={local} onChange={handleChange} />

      <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-slate-50/90 backdrop-blur py-3 -mx-6 px-6 border-t border-slate-200">
        {dirty && <span className="text-xs text-amber-600">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || upsert.isPending} className="gap-2">
          {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {upsert.isPending ? 'Salvando...' : 'Salvar regras'}
        </Button>
      </div>
    </div>
  )
}
