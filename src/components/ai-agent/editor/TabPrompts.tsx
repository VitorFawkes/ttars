import { useRef } from 'react'
import { Sparkles, Download } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { PromptVariablesPanel } from './PromptVariablesPanel'
import type { AgentEditorForm } from './types'
import {
  JULIA_PROMPT_MAIN, JULIA_PROMPT_CONTEXT, JULIA_PROMPT_DATA_UPDATE,
  JULIA_PROMPT_FORMATTING, JULIA_PROMPT_VALIDATOR,
} from '@/lib/julia-defaults'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
}

type PromptKey = 'main' | 'context' | 'data_update' | 'formatting' | 'validator'

const PROMPT_BLOCKS: Array<{ key: PromptKey; title: string; hint: string; placeholder: string; juliaDefault: string; juliaHint: string }> = [
  {
    key: 'main', title: '1. Prompt principal',
    hint: 'Comportamento, regras e papéis do agente. Base da personalidade.',
    placeholder: 'Você é Julia, consultora de viagens da Welcome Viagens...',
    juliaDefault: JULIA_PROMPT_MAIN,
    juliaHint: 'Persona Julia completa: regras de VIAJANTE, não-repetição de formulário, fluxo Club Med, critérios de qualificação e desqualificação, gates para apresentar taxa/reunião.',
  },
  {
    key: 'context', title: '2. Prompt de contexto',
    hint: 'Como consolidar ai_resumo e ai_contexto do card a partir do histórico. Corresponde ao agente "Atualiza Info Lead e Contexto" no fluxo antigo.',
    placeholder: 'Consolide o contexto do card olhando o histórico...',
    juliaDefault: JULIA_PROMPT_CONTEXT,
    juliaHint: 'Regras de o que entra/não entra em ai_resumo, cronologia em ai_contexto, regra VIAJANTE ([Viajante: X]).',
  },
  {
    key: 'data_update', title: '3. Prompt de atualização de dados',
    hint: 'Quais campos do CRM pode atualizar e com que nível de evidência. Corresponde ao "Atualiza dados" no fluxo antigo.',
    placeholder: 'Atualize apenas os campos listados em Contexto & Campos quando houver evidência clara...',
    juliaDefault: JULIA_PROMPT_DATA_UPDATE,
    juliaHint: 'Colunas permitidas, regras de estágio (Tentativa → Conectado → Reunião Agendada), normalização de CPF/data/email.',
  },
  {
    key: 'formatting', title: '4. Prompt de formatação',
    hint: 'Divisão em blocos, markdown de WhatsApp, regras de link. Corresponde ao "Format WhatsApp Messages" no fluxo antigo.',
    placeholder: 'Divida a resposta em até 3 blocos. Use *negrito* para destaques...',
    juliaDefault: JULIA_PROMPT_FORMATTING,
    juliaHint: 'Regras de divisão em 3 blocos, markdown WhatsApp (*negrito*, ~tachado~, `link`), pergunta em bloco separado.',
  },
  {
    key: 'validator', title: '5. Prompt do validador',
    hint: 'Regras de bloqueio/correção antes de enviar. Corresponde ao "Validador" no fluxo antigo.',
    placeholder: 'Antes de liberar a resposta: verifique se não menciona que é IA...',
    juliaDefault: JULIA_PROMPT_VALIDATOR,
    juliaHint: 'Os 8 checks da Julia: menção a IA, inventar fatos, tom robótico, repetir apresentação, mencionar sistema, rejeitar cedo, "não trabalhamos isolado", Club Med taxa/reunião.',
  },
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label className="text-base">{block.title}</Label>
              <p className="text-xs text-slate-500 mt-0.5">{block.hint}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 flex-shrink-0"
              onClick={() => {
                const current = getValue(block.key)
                if (current.trim().length > 0) {
                  if (!confirm(`Substituir o conteúdo atual de "${block.title}" pelo padrão Julia?`)) return
                }
                setValue(block.key, block.juliaDefault)
                toast.success(`Padrão Julia carregado em "${block.title}"`)
              }}
              title={block.juliaHint}
            >
              <Download className="w-4 h-4" /> Usar padrão Julia
            </Button>
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
