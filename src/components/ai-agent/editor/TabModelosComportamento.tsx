import { Brain, Clock } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/Select'
import { MODELO_OPTIONS, type AgentEditorForm, type PipelineModelKey } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

const PIPELINE_LABELS: Record<PipelineModelKey, { label: string; hint: string }> = {
  main: { label: 'Resposta principal', hint: 'Modelo que gera a resposta ao cliente' },
  formatter: { label: 'Formatador', hint: 'Quebra a resposta em blocos de WhatsApp' },
  validator: { label: 'Validador', hint: 'Aplica regras antes de enviar' },
  context: { label: 'Contexto', hint: 'Consolida ai_resumo e ai_contexto do card' },
  data: { label: 'Dados', hint: 'Decide atualizações no contato/card' },
}

export function TabModelosComportamento({ form, setForm }: Props) {
  const setPipelineModel = (key: PipelineModelKey, patch: Partial<AgentEditorForm['pipeline_models'][PipelineModelKey]>) => {
    setForm(f => ({
      ...f,
      pipeline_models: {
        ...f.pipeline_models,
        [key]: { ...f.pipeline_models[key], ...patch },
      },
    }))
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-5">
        <header className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Modelo principal</h2>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          O modelo que o agente usa quando não há configuração específica por fase. Serve como padrão.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Modelo LLM</Label>
            <Select
              value={form.modelo}
              onChange={(v: string) => setForm(f => ({ ...f, modelo: v }))}
              options={MODELO_OPTIONS}
            />
          </div>
          <div className="space-y-2">
            <Label>Temperature ({form.temperature.toFixed(1)})</Label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={form.temperature}
              onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))}
              className="w-full accent-indigo-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>Preciso</span><span>Criativo</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Max tokens</Label>
            <Input
              type="number"
              value={form.max_tokens}
              onChange={e => setForm(f => ({ ...f, max_tokens: parseInt(e.target.value) || 1024 }))}
            />
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Modelos por fase do pipeline</h2>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Permite usar modelo diferente em cada fase (ex: formatar com modelo mais rápido/barato).
        </p>

        <div className="space-y-3">
          {(Object.keys(PIPELINE_LABELS) as PipelineModelKey[]).map(key => {
            const cfg = form.pipeline_models[key]
            const meta = PIPELINE_LABELS[key]
            return (
              <div key={key} className="grid grid-cols-12 gap-3 items-center border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                <div className="col-span-12 md:col-span-3">
                  <p className="text-sm font-medium text-slate-800">{meta.label}</p>
                  <p className="text-xs text-slate-500">{meta.hint}</p>
                </div>
                <div className="col-span-6 md:col-span-4">
                  <Select
                    value={cfg.model}
                    onChange={(v: string) => setPipelineModel(key, { model: v })}
                    options={MODELO_OPTIONS}
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <input
                    type="range"
                    min="0" max="1" step="0.1"
                    value={cfg.temperature}
                    onChange={e => setPipelineModel(key, { temperature: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-600"
                  />
                  <p className="text-[11px] text-slate-400 text-center">temp {cfg.temperature.toFixed(1)}</p>
                </div>
                <div className="col-span-12 md:col-span-2">
                  <Input
                    type="number"
                    value={cfg.max_tokens}
                    onChange={e => setPipelineModel(key, { max_tokens: parseInt(e.target.value) || 1024 })}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Comportamento temporal</h2>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Como o agente respeita o ritmo humano da conversa.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Tempo pra juntar mensagens (segundos)</Label>
            <Input
              type="number" min="0"
              value={form.timings.debounce_seconds}
              onChange={e => setForm(f => ({ ...f, timings: { ...f.timings, debounce_seconds: parseInt(e.target.value) || 0 } }))}
            />
            <p className="text-[11px] text-slate-400">Quando o cliente envia várias mensagens em sequência, o agente espera esse tempo antes de responder, pra agrupar tudo numa resposta única. Recomendado: 20s.</p>
          </div>
          <div className="space-y-2">
            <Label>Pausa entre mensagens (segundos)</Label>
            <Input
              type="number" min="0"
              value={form.timings.typing_delay_seconds}
              onChange={e => setForm(f => ({ ...f, timings: { ...f.timings, typing_delay_seconds: parseInt(e.target.value) || 0 } }))}
            />
            <p className="text-[11px] text-slate-400">Quando o agente quebra a resposta em mais de uma mensagem, espera esse tempo entre cada uma pra parecer que está digitando.</p>
          </div>
          <div className="space-y-2">
            <Label>Máximo de mensagens por resposta</Label>
            <Input
              type="number" min="1" max="10"
              value={form.timings.max_message_blocks}
              onChange={e => setForm(f => ({ ...f, timings: { ...f.timings, max_message_blocks: parseInt(e.target.value) || 1 } }))}
            />
            <p className="text-[11px] text-slate-400">Em quantas mensagens o agente pode quebrar a resposta. 3 costuma ser natural no WhatsApp.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
