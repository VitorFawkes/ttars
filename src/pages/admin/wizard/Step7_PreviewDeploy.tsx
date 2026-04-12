import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase'
import {
  CheckCircle, AlertCircle, Loader2, Rocket, PhoneForwarded, CheckCheck, XCircle,
} from 'lucide-react'
import { AgentPlayground } from '@/components/agent-simulator/AgentPlayground'
import { cn } from '@/lib/utils'
import type { WizardStep7, useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

interface WhatsAppLine {
  id: string
  phone_number_label: string
}

interface ChecklistItem {
  label: string
  ok: boolean
  critical: boolean
}

export default function Step7_PreviewDeploy({ wizard }: WizardProps) {
  const step7 = (wizard.wizardData.step7 || {}) as Partial<WizardStep7>
  const [phoneLineId, setPhoneLineId] = useState(step7.phone_line_id || '')
  const [goLive, setGoLive] = useState(step7.go_live || false)
  const [showSuccess, setShowSuccess] = useState(false)

  const { data: phoneLines = [], isLoading: linesLoading } = useQuery({
    queryKey: ['whatsapp-linha-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_linha_config')
        .select('id, phone_number_label')
      if (error) throw error
      return ((data || []) as unknown as WhatsAppLine[])
    },
  })

  const stageCount = (wizard.wizardData.step3?.stages || []).length
  const kbCount = (wizard.wizardData.step4?.kb_items || []).length
  const scenarioCount = (wizard.wizardData.step5?.special_scenarios || []).length
  const activeTriggerCount = ((wizard.wizardData.step6?.escalation_triggers || []) as Array<{ enabled?: boolean }>)
    .filter((t) => t.enabled).length

  const checklist = useMemo<ChecklistItem[]>(() => {
    const s1 = wizard.wizardData.step1 || {}
    return [
      { label: 'Nome do agente definido', ok: !!s1.agent_name?.trim(), critical: true },
      { label: 'Nome da empresa definido', ok: !!s1.company_name?.trim(), critical: true },
      { label: 'Template escolhido', ok: !!wizard.wizardData.step2?.template_id, critical: true },
      { label: 'Pelo menos 1 etapa de qualificação', ok: stageCount > 0, critical: true },
      { label: 'Linha WhatsApp selecionada', ok: !!phoneLineId, critical: true },
      { label: 'Base de conhecimento configurada', ok: kbCount > 0, critical: false },
      { label: 'Cenários especiais definidos', ok: scenarioCount > 0, critical: false },
      { label: 'Regras de escalação ativas', ok: activeTriggerCount > 0, critical: false },
    ]
  }, [wizard.wizardData, stageCount, kbCount, scenarioCount, activeTriggerCount, phoneLineId])

  const criticalMissing = checklist.filter((c) => c.critical && !c.ok)
  const canDeploy = criticalMissing.length === 0

  const handleSubmit = async () => {
    wizard.updateStep('step7', { phone_line_id: phoneLineId, go_live: goLive })
    try {
      await wizard.submitWizard.mutateAsync()
      setShowSuccess(true)
    } catch (err) {
      console.error('Erro ao criar agente:', err)
    }
  }

  if (showSuccess && wizard.submitWizard.isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Agente criado!</h2>
        <p className="text-slate-500 mt-2 max-w-sm">
          {goLive ? 'Seu agente está ativo e já responde conversas.' : 'Seu agente foi salvo como rascunho. Você pode ativá-lo a qualquer momento.'}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Redirecionando...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Testar e ativar</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Converse com o agente como se fosse o cliente. Quando estiver feliz, ative.
        </p>
      </div>

      {/* Simulator */}
      <AgentPlayground wizardData={wizard.wizardData} />

      {/* Deploy panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Checklist */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCheck className="w-4 h-4 text-slate-600" />
            <h3 className="font-semibold text-slate-900">Antes de ativar</h3>
          </div>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                {item.ok ? (
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                ) : item.critical ? (
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                )}
                <span className={cn(
                  item.ok ? 'text-slate-700' : item.critical ? 'text-red-700 font-medium' : 'text-slate-400'
                )}>
                  {item.label}
                </span>
                {!item.critical && !item.ok && (
                  <Badge variant="outline" className="ml-auto text-[10px]">opcional</Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Deploy */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <PhoneForwarded className="w-4 h-4 text-slate-600" />
            <h3 className="font-semibold text-slate-900">Colocar em produção</h3>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-medium">Linha WhatsApp</label>
            {linesLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : phoneLines.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Nenhuma linha configurada. Configure uma antes.
              </div>
            ) : (
              <select
                value={phoneLineId}
                onChange={(e) => setPhoneLineId(e.target.value)}
                className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Selecione uma linha...</option>
                {phoneLines.map((line) => (
                  <option key={line.id} value={line.id}>{line.phone_number_label}</option>
                ))}
              </select>
            )}
          </div>

          <label className={cn(
            'flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors',
            goLive ? 'border-green-500 bg-green-50/50' : 'border-slate-200 bg-slate-50'
          )}>
            <Switch checked={goLive} onCheckedChange={setGoLive} />
            <div className="min-w-0">
              <p className="font-medium text-sm text-slate-900">Ativar agente agora</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {goLive
                  ? 'O agente vai começar a responder clientes reais imediatamente.'
                  : 'Criar como rascunho. Você pode ativar depois no painel.'}
              </p>
            </div>
          </label>

          {wizard.submitWizard.isError && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{(wizard.submitWizard.error as Error).message}</span>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!canDeploy || wizard.submitWizard.isPending}
            className="w-full gap-2"
          >
            {wizard.submitWizard.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Criando agente...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" />
                {goLive ? 'Ativar agente' : 'Criar como rascunho'}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex justify-between">
        <Button onClick={() => wizard.goBack()} variant="outline">← Voltar</Button>
      </div>
    </div>
  )
}
