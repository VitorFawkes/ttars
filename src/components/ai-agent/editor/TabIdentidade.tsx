import { Bot } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

export function TabIdentidade({ form, setForm }: Props) {
  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center gap-2">
        <Bot className="w-5 h-5 text-indigo-500" />
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Identidade</h2>
      </header>
      <p className="text-sm text-slate-500 -mt-3">
        Nome e persona do agente. O cliente não vê o nome — ele é só para você identificar o agente no hub.
      </p>

      <div className="space-y-2">
        <Label>Nome do agente *</Label>
        <Input
          value={form.nome}
          onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
          placeholder="Ex: Luna, Estela"
        />
      </div>

      <div className="space-y-2">
        <Label>Persona (como o agente se apresenta)</Label>
        <Input
          value={form.persona}
          onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
          placeholder="Consultora de viagens especializada em destinos internacionais"
        />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
        <Switch
          checked={form.ativa}
          onCheckedChange={v => setForm(f => ({ ...f, ativa: v }))}
        />
        <Label className="cursor-pointer">Agente ativo</Label>
        <span className="text-xs text-slate-500">
          Quando desligado, nenhuma mensagem é respondida, mesmo com linhas ativas.
        </span>
      </div>
    </section>
  )
}
