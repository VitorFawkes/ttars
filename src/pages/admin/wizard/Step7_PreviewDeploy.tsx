import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/lib/supabase'
import { CheckCircle, AlertCircle, Loader } from 'lucide-react'
import type { WizardStep7 } from '@/hooks/useAgentWizard'
import type { useAgentWizard } from '@/hooks/useAgentWizard'

type WizardProps = { wizard: ReturnType<typeof useAgentWizard> }

interface WhatsAppLine {
  id: string
  phone_number_label: string
}

export default function Step7_PreviewDeploy({ wizard }: WizardProps) {
  const step7 = (wizard.wizardData.step7 || {}) as Partial<WizardStep7>
  const [phoneLineId, setPhoneLineId] = useState(step7.phone_line_id || '')
  const [goLive, setGoLive] = useState(step7.go_live || false)
  const [showSuccess, setShowSuccess] = useState(false)

  // Fetch available phone lines
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

  // Count escalation triggers
  const escalationRuleCount = useMemo(() => {
    const triggers = wizard.wizardData.step6?.escalation_triggers || []
    return Array.isArray(triggers) ? triggers.filter((t: any) => t.enabled).length : 0
  }, [wizard.wizardData.step6])

  // Count KB items
  const kbItemCount = useMemo(() => {
    const items = wizard.wizardData.step4?.kb_items || []
    return Array.isArray(items) ? items.length : 0
  }, [wizard.wizardData.step4])

  // Count qualification stages
  const stageCount = useMemo(() => {
    const stages = wizard.wizardData.step3?.stages || []
    return Array.isArray(stages) ? stages.length : 0
  }, [wizard.wizardData.step3])

  const handleSubmit = async () => {
    wizard.updateStep('step7', {
      phone_line_id: phoneLineId,
      go_live: goLive,
    })
    try {
      await wizard.submitWizard.mutate()
      setShowSuccess(true)
    } catch (error) {
      console.error('Error submitting wizard:', error)
    }
  }

  const handleBack = () => {
    wizard.updateStep('step7', {
      phone_line_id: phoneLineId,
      go_live: goLive,
    })
    wizard.goBack()
  }

  // Simple preview chat component
  const ChatPreview = () => {
    const messages = [
      { role: 'agent', text: 'Olá! Bem-vindo à ' + (wizard.wizardData.step1?.company_name || 'nossa empresa') },
      { role: 'user', text: 'Oi, gostaria de conhecer seus serviços' },
      { role: 'agent', text: 'Claro! Ficarei feliz em ajudá-lo. Qual é seu interesse?' },
    ]

    return (
      <div className="bg-slate-100 rounded-lg p-4 h-64 overflow-y-auto space-y-3 flex flex-col">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'agent' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-xs px-4 py-2 rounded-lg ${
                msg.role === 'agent'
                  ? 'bg-green-600 text-white rounded-bl-none'
                  : 'bg-white text-slate-900 border border-slate-200 rounded-br-none'
              }`}
            >
              <p className="text-sm">{msg.text}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (showSuccess && wizard.submitWizard.isSuccess) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-16 h-16 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Agente criado com sucesso!</h2>
          <p className="text-slate-500 mb-6">
            Seu agente IA está sendo inicializado. Você será redirecionado em breve.
          </p>
          <div className="inline-flex items-center gap-2">
            <Loader className="w-5 h-5 text-indigo-600 animate-spin" />
            <span className="text-slate-600">Redirecionando...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Revisar e ativar</h2>
        <p className="text-slate-500 mt-2">
          Revise a configuração do seu agente e coloque em produção.
        </p>
      </div>

      <div className="space-y-6">
        {/* Configuration Summary */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-slate-900">Resumo da configuração</h3>

          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-700">Nome do agente</span>
              <span className="font-medium text-slate-900">{wizard.wizardData.step1?.agent_name || '-'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-700">Empresa</span>
              <span className="font-medium text-slate-900">{wizard.wizardData.step1?.company_name || '-'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-700">Template escolhido</span>
              <span className="font-medium text-slate-900">
                {wizard.wizardData.step2?.template_id ? 'Customizado' : '-'}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-700">Etapas de qualificação</span>
              <span className="font-medium text-slate-900">{stageCount}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-700">Itens na Base de Conhecimento</span>
              <span className="font-medium text-slate-900">{kbItemCount}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200">
              <span className="text-slate-700">Modelo de precificação</span>
              <span className="font-medium text-slate-900 capitalize">
                {wizard.wizardData.step5?.pricing_model || '-'}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-700">Regras de escalação ativas</span>
              <span className="font-medium text-slate-900">{escalationRuleCount}</span>
            </div>
          </div>
        </div>

        {/* Chat Preview */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-slate-900">Prévia da conversa</h3>
          <ChatPreview />
        </div>

        {/* Phone Line Selection */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900">Linha WhatsApp</h3>
            <p className="text-sm text-slate-500 mt-1">Selecione qual linha WhatsApp este agente usará</p>
          </div>

          {linesLoading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader className="w-4 h-4 animate-spin" />
              Carregando linhas...
            </div>
          ) : phoneLines.length === 0 ? (
            <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Nenhuma linha WhatsApp configurada. Configure primeiro.</span>
            </div>
          ) : (
            <select
              value={phoneLineId}
              onChange={(e) => setPhoneLineId(e.target.value)}
              className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="">Selecione uma linha...</option>
              {phoneLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.phone_number_label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Go Live Toggle */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Ativar agente</h3>
              <p className="text-sm text-slate-500 mt-1">
                {goLive
                  ? 'Seu agente estará disponível assim que criado'
                  : 'Agente será criado como desativado (pode ativar depois)'}
              </p>
            </div>
            <Switch checked={goLive} onCheckedChange={setGoLive} />
          </div>

          {goLive && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Agente será ativado em produção</span>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {wizard.submitWizard.isError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{(wizard.submitWizard.error as Error).message}</span>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button onClick={handleBack} variant="outline" className="text-slate-900 border-slate-300">
          Voltar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={
            !phoneLineId || wizard.submitWizard.isPending || !goLive
          }
          className={`text-white gap-2 ${
            wizard.submitWizard.isPending || !goLive
              ? 'bg-slate-400'
              : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {wizard.submitWizard.isPending && (
            <Loader className="w-4 h-4 animate-spin" />
          )}
          {wizard.submitWizard.isPending ? 'Criando agente...' : 'Criar agente'}
        </Button>
      </div>
    </div>
  )
}
