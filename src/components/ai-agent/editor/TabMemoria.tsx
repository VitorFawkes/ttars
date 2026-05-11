import { Database } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

export function TabMemoria({ form, setForm }: Props) {
  const mc = form.memory_config as unknown as Record<string, unknown>
  const maxHistory = Number(mc.max_history_turns ?? 30)
  const shortTerm = Number(mc.short_term_turns ?? 10)

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center gap-2">
        <Database className="w-5 h-5 text-sky-500" />
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Memória</h2>
      </header>
      <p className="text-sm text-slate-500 -mt-2">
        Quantas mensagens anteriores o agente carrega e quais vão no prompt principal. Valores altos aumentam contexto mas sobem o custo por turno.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Histórico total (turnos)</Label>
          <Input
            type="number" min="1" max="200"
            value={maxHistory}
            onChange={e => setForm(f => ({
              ...f,
              memory_config: {
                ...(f.memory_config as object),
                max_history_turns: parseInt(e.target.value) || 30,
              } as AgentEditorForm['memory_config'],
            }))}
          />
          <p className="text-[11px] text-slate-400">
            Total de turnos recuperados do banco. Default 30.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Janela curta (turnos recentes)</Label>
          <Input
            type="number" min="1" max="50"
            value={shortTerm}
            onChange={e => setForm(f => ({
              ...f,
              memory_config: {
                ...(f.memory_config as object),
                short_term_turns: parseInt(e.target.value) || 10,
              } as AgentEditorForm['memory_config'],
            }))}
          />
          <p className="text-[11px] text-slate-400">
            Sub-slice que vai no "histórico compacto" (pro prompt principal, mais barato). Default 10.
          </p>
        </div>
      </div>
    </section>
  )
}
