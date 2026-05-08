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

      <div className="pt-4 border-t border-slate-100 space-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Modelo do agente</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium">
              novo
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Escolha como o agente organiza a conversa. Você pode alternar sem perder dados.
          </p>
        </div>

        <div className="space-y-2">
          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${!form.playbook_enabled ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
            <input
              type="radio"
              checked={!form.playbook_enabled}
              onChange={() => setForm(f => ({ ...f, playbook_enabled: false }))}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900">Clássico</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Abas separadas: Apresentação, Funil de Qualificação, Cenários Especiais.
              </div>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.playbook_enabled ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
            <input
              type="radio"
              checked={form.playbook_enabled}
              onChange={() => setForm(f => ({ ...f, playbook_enabled: true }))}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                Playbook
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">beta</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Aba única com momentos da conversa, frases-âncora, linhas vermelhas e sinais silenciosos.
                <strong className="block mt-1 text-amber-700">⚠ Ao ligar, Apresentação e Funil de Qualificação são substituídos por "Playbook". Dados antigos ficam preservados.</strong>
              </div>
            </div>
          </label>
        </div>
      </div>
    </section>
  )
}
