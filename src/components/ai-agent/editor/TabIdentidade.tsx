import { Bot, Sparkles, HeadphonesIcon, ShieldCheck, Brain, ArrowRightLeft } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/switch'
import type { AgentEditorForm } from './types'
import type { AgentTipo } from '@/hooks/useAiAgents'

const TIPO_OPTIONS: { value: AgentTipo; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'sales', label: 'Vendas', icon: Sparkles },
  { value: 'support', label: 'Suporte', icon: HeadphonesIcon },
  { value: 'success', label: 'Customer Success', icon: ShieldCheck },
  { value: 'specialist', label: 'Especialista', icon: Brain },
  { value: 'router', label: 'Roteador', icon: ArrowRightLeft },
]

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
        Nome, tipo e descrição visíveis para sua equipe. O cliente não vê esse nome — ele é só para você identificar o agente no hub.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome do agente *</Label>
          <Input
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Julia Sales"
          />
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select
            value={form.tipo}
            onChange={(v: string) => setForm(f => ({ ...f, tipo: v as AgentTipo }))}
            options={TIPO_OPTIONS.map(t => ({ value: t.value, label: t.label }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Persona (como o agente se apresenta)</Label>
        <Input
          value={form.persona}
          onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
          placeholder="Consultora de viagens especializada em destinos internacionais"
        />
      </div>

      <div className="space-y-2">
        <Label>Descrição interna</Label>
        <Textarea
          value={form.descricao}
          onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
          placeholder="O que este agente faz e quando é acionado"
          rows={2}
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
