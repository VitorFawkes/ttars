import { useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PromptVariablesPanel } from './PromptVariablesPanel'
import type { AgentEditorForm } from './types'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

type PromptKey = 'main' | 'context' | 'data_update' | 'formatting' | 'validator'

const PROMPT_BLOCKS: Array<{ key: PromptKey; title: string; hint: string; placeholder: string }> = [
  { key: 'main', title: '1. Prompt principal', hint: 'Comportamento, regras e papéis do agente. Base da personalidade.', placeholder: 'Você é Julia, consultora de viagens da Welcome Viagens...' },
  { key: 'context', title: '2. Prompt de contexto', hint: 'Como consolidar ai_resumo e ai_contexto do card a partir do histórico.', placeholder: 'Consolide o contexto do card olhando o histórico. Destaque intenção, destino, datas e bloqueios...' },
  { key: 'data_update', title: '3. Prompt de atualização de dados', hint: 'Quais campos do CRM pode atualizar e com que nível de evidência.', placeholder: 'Atualize apenas os campos listados em Contexto & Campos quando houver evidência clara na conversa...' },
  { key: 'formatting', title: '4. Prompt de formatação', hint: 'Divisão em blocos, markdown de WhatsApp, regras de link.', placeholder: 'Divida a resposta em até 3 blocos. Use *negrito* para destaques e nunca envie links quebrados...' },
  { key: 'validator', title: '5. Prompt do validador', hint: 'Regras de bloqueio/correção antes de enviar. Ex: não mencionar IA, não inventar fatos.', placeholder: 'Antes de liberar a resposta: verifique se não menciona que é IA, não inventa fatos e não repete apresentação em mensagem não-inicial...' },
]

export function TabPrompts({ form, setForm }: Props) {
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const focusedKey = useRef<PromptKey>('main')

  const getValue = (key: PromptKey) => {
    if (key === 'main') return form.system_prompt
    return form.prompts_extra[key]
  }

  const setValue = (key: PromptKey, value: string) => {
    if (key === 'main') {
      setForm(f => ({ ...f, system_prompt: value }))
    } else {
      setForm(f => ({ ...f, prompts_extra: { ...f.prompts_extra, [key]: value } }))
    }
  }

  const insertAt = (token: string) => {
    const key = focusedKey.current
    const el = refs.current[key]
    const value = getValue(key)
    if (!el) {
      setValue(key, value + token)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    setValue(key, next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }

  const mainPreview = (form.system_prompt || '').slice(0, 280)

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Prompts</h2>
        </header>
        <p className="text-sm text-slate-500 -mt-1">
          Cinco blocos que formam a cabeça do agente. Cada bloco tem um papel claro — deixar o #1 completo e os outros vazios ainda funciona, mas você perde controle fino.
        </p>
        <PromptVariablesPanel onInsert={insertAt} />
      </section>

      {PROMPT_BLOCKS.map(block => (
        <section key={block.key} className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-3">
          <div>
            <Label className="text-base">{block.title}</Label>
            <p className="text-xs text-slate-500 mt-0.5">{block.hint}</p>
          </div>
          <Textarea
            ref={(el: HTMLTextAreaElement | null) => { refs.current[block.key] = el }}
            value={getValue(block.key)}
            onChange={e => setValue(block.key, e.target.value)}
            onFocus={() => { focusedKey.current = block.key }}
            placeholder={block.placeholder}
            rows={block.key === 'main' ? 12 : 6}
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-slate-400">
            {getValue(block.key).length} caracteres
          </p>
        </section>
      ))}

      {mainPreview && (
        <section className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 space-y-2">
          <p className="text-xs font-medium text-indigo-700 uppercase tracking-wide">Prévia do prompt montado</p>
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono max-h-48 overflow-auto">
            {mainPreview}{form.system_prompt.length > 280 ? '…' : ''}
          </pre>
        </section>
      )}
    </div>
  )
}
