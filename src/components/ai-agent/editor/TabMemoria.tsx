import { Database } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/Select'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

export function TabMemoria({ form, setForm }: Props) {
  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
      <header className="flex items-center gap-2">
        <Database className="w-5 h-5 text-sky-500" />
        <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Memória</h2>
      </header>
      <p className="text-sm text-slate-500 -mt-2">
        Como o agente lembra das conversas anteriores. A Julia hoje usa janela de 20 mensagens por sessão (telefone + card).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo de memória</Label>
          <Select
            value={form.memory_config.tipo}
            onChange={(v: string) => setForm(f => ({ ...f, memory_config: { ...f.memory_config, tipo: v as 'buffer_window' | 'vector' } }))}
            options={[
              { value: 'buffer_window', label: 'Janela (últimas N mensagens)' },
              { value: 'vector', label: 'Vetorial (busca semântica)' },
            ]}
          />
          <p className="text-[11px] text-slate-400">
            Janela é o padrão. Vetorial exige índice ativo e custo maior por mensagem.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Tamanho da janela</Label>
          <Input
            type="number" min="1" max="200"
            value={form.memory_config.window_size}
            onChange={e => setForm(f => ({ ...f, memory_config: { ...f.memory_config, window_size: parseInt(e.target.value) || 20 } }))}
          />
          <p className="text-[11px] text-slate-400">
            Quantas mensagens recentes o agente carrega a cada turno.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Chave de sessão</Label>
        <Input
          value={form.memory_config.session_key_template}
          onChange={e => setForm(f => ({ ...f, memory_config: { ...f.memory_config, session_key_template: e.target.value } }))}
          placeholder="{{telefone}}|{{card_id}}"
          className="font-mono text-sm"
        />
        <p className="text-[11px] text-slate-400">
          Define o escopo da memória. Ex: <code>{'{{telefone}}|{{card_id}}'}</code> = memória separada por card.
          <code>{'{{telefone}}'}</code> = memória global do contato.
        </p>
      </div>
    </section>
  )
}
