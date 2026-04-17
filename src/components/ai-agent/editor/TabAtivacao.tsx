import { Power, Phone, AlertTriangle, PowerOff, ChevronUp, ChevronDown } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AgentEditorForm } from './types'
import { useTogglePhoneLineConfig } from '@/hooks/useAiAgents'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

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
  const queryClient = useQueryClient()
  const sortedLines = phoneLines ? [...phoneLines].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)) : []
  const allLinesInactive = sortedLines.length > 0 && sortedLines.every(l => !l.ativa)

  const movePriority = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= sortedLines.length) return
    const a = sortedLines[idx]
    const b = sortedLines[target]
    // Troca priorities: o de cima fica com priority maior
    const aNew = b.priority ?? 0
    const bNew = a.priority ?? 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    try {
      await Promise.all([
        sb.from('ai_agent_phone_line_config').update({ priority: aNew }).eq('id', a.id),
        sb.from('ai_agent_phone_line_config').update({ priority: bNew }).eq('id', b.id),
      ])
      queryClient.invalidateQueries({ queryKey: ['ai-agents', 'detail', agentId] })
    } catch {
      toast.error('Erro ao reordenar linhas')
    }
  }

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

        {sortedLines.length === 0 ? (
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
            {sortedLines.length > 1 && (
              <p className="text-xs text-slate-400 italic">Use as setas para mudar a prioridade quando a mesma mensagem pode chegar em várias linhas.</p>
            )}
            {sortedLines.map((line, idx) => (
              <div key={line.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {sortedLines.length > 1 && (
                    <div className="flex flex-col flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => movePriority(idx, -1)} disabled={idx === 0} className="p-0 h-5 w-5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => movePriority(idx, 1)} disabled={idx === sortedLines.length - 1} className="p-0 h-5 w-5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
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
