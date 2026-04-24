import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { useAgentIdentity, type IdentityConfig } from '@/hooks/playbook/useAgentIdentity'
import { SuggestVariationsButton } from '../shared/SuggestVariationsButton'

const ROLES = [
  { value: 'SDR', label: 'SDR (qualificação e handoff)' },
  { value: 'Suporte', label: 'Atendimento / Suporte' },
  { value: 'Pós-venda', label: 'Pós-venda' },
  { value: 'Vendedor', label: 'Vendedor completo' },
  { value: 'custom', label: 'Outro' },
]

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

export function IdentitySection({ agentId, agentName, companyName }: Props) {
  const { identity, isLoading, save } = useAgentIdentity(agentId)
  const [role, setRole] = useState<string>('SDR')
  const [roleCustom, setRoleCustom] = useState('')
  const [mission, setMission] = useState('')
  const [companyDescOverride, setCompanyDescOverride] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (identity) {
      setRole(identity.role ?? 'SDR')
      setRoleCustom(identity.role_custom ?? '')
      setMission(identity.mission_one_liner ?? '')
      setCompanyDescOverride(identity.company_description_override ?? '')
      setDirty(false)
    }
  }, [identity?.role, identity?.role_custom, identity?.mission_one_liner, identity?.company_description_override])

  const markDirty = () => setDirty(true)

  const handleSave = async () => {
    const config: IdentityConfig = {
      role,
      role_custom: role === 'custom' ? roleCustom.trim() : null,
      mission_one_liner: mission.trim(),
      company_description_override: companyDescOverride.trim() || null,
    }
    try {
      await save.mutateAsync(config)
      toast.success('Identidade salva')
      setDirty(false)
    } catch (err) {
      console.error('[IdentitySection] save error:', err)
      toast.error('Não consegui salvar.')
    }
  }

  if (isLoading) return <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Função principal</label>
        <select value={role} onChange={(e) => { setRole(e.target.value); markDirty() }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {role === 'custom' && (
          <input value={roleCustom} onChange={(e) => { setRoleCustom(e.target.value); markDirty() }}
            placeholder="Ex: Cobrança, Onboarding..." className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-slate-700">Em 1 frase, o que ele faz?</label>
          <SuggestVariationsButton
            text={mission}
            fieldType="mission_one_liner"
            context={{ agent_nome: agentName, agent_role: role === 'custom' ? roleCustom : role, company_name: companyName }}
            onSelect={(t) => { setMission(t); markDirty() }}
          />
        </div>
        <textarea value={mission} onChange={(e) => { setMission(e.target.value); markDirty() }}
          placeholder={`Entende o que o cliente busca e conecta com especialista.`}
          className="w-full min-h-[70px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Descrição da empresa (opcional — sobrepõe a geral)
        </label>
        <textarea value={companyDescOverride} onChange={(e) => { setCompanyDescOverride(e.target.value); markDirty() }}
          placeholder="Deixe vazio pra usar a descrição padrão da empresa."
          className="w-full min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        {dirty && <span className="text-xs text-amber-600 self-center mr-3">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || save.isPending} size="sm" className="gap-1.5">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </Button>
      </div>
    </div>
  )
}
