import { Power, Phone, AlertTriangle, PowerOff } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AgentEditorForm } from './types'
import { useTogglePhoneLineConfig } from '@/hooks/useAiAgents'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  agentId?: string
  phoneLines?: Array<{
    id: string
    phone_line_id: string
    ativa: boolean
    priority: number
    whatsapp_linha_config?: {
      phone_number_label: string | null
      phone_number_id: string | null
    } | null
  }>
}

export function TabAtivacao({ form, setForm, agentId, phoneLines }: Props) {
  const togglePhoneLine = useTogglePhoneLineConfig(agentId)
  const allLinesInactive = phoneLines && phoneLines.length > 0 && phoneLines.every(l => !l.ativa)

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Power className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Ativação do agente</h2>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Liga o agente como um todo. Quando desligado, nenhuma mensagem é respondida automaticamente mesmo se houver linhas ativas abaixo.
        </p>

        <div className="flex items-center gap-3">
          <Switch
            checked={form.ativa}
            onCheckedChange={v => setForm(f => ({ ...f, ativa: v }))}
          />
          <Label className="cursor-pointer">Agente ativo</Label>
        </div>

        {!form.ativa && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <PowerOff className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">Agente desligado. Ative pra voltar a responder.</p>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-teal-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Linhas WhatsApp atendidas</h2>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Linhas em que este agente responde. Cada linha pode ser ligada/desligada individualmente sem desligar o agente inteiro.
        </p>

        {!phoneLines || phoneLines.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-lg">
            Nenhuma linha WhatsApp vinculada. Vincule em Configurações &gt; WhatsApp.
          </p>
        ) : (
          <div className="space-y-2">
            {form.ativa && allLinesInactive && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">Agente ligado, mas nenhuma linha está ativa. Ative pelo menos uma abaixo.</p>
              </div>
            )}
            {phoneLines.map(line => (
              <div key={line.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', line.ativa && form.ativa ? 'bg-green-500' : 'bg-slate-300')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {line.whatsapp_linha_config?.phone_number_label || 'Linha sem nome'}
                    </p>
                    {line.whatsapp_linha_config?.phone_number_id && (
                      <p className="text-xs text-slate-500 truncate">ID: {line.whatsapp_linha_config.phone_number_id}</p>
                    )}
                  </div>
                </div>
                <Switch
                  checked={line.ativa}
                  disabled={togglePhoneLine.isPending}
                  onCheckedChange={(v) => {
                    togglePhoneLine.mutate(
                      { configId: line.id, ativa: v },
                      {
                        onSuccess: () => toast.success(v ? 'Linha ativada' : 'Linha desativada'),
                        onError: () => toast.error('Erro ao atualizar linha'),
                      }
                    )
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
