import { useRef } from 'react'
import { Sparkles, Download } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { PromptVariablesPanel } from './PromptVariablesPanel'
import { FieldAwareTextarea, type FieldAwareTextareaHandle } from './FieldAwareTextarea'
import { useAiAgentDetail } from '@/hooks/useAiAgents'
import { useProducts } from '@/hooks/useProducts'
import type { AgentEditorForm } from './types'
import {
  JULIA_PROMPT_MAIN, JULIA_PROMPT_CONTEXT, JULIA_PROMPT_DATA_UPDATE,
  JULIA_PROMPT_FORMATTING, JULIA_PROMPT_VALIDATOR,
} from '@/lib/julia-defaults'

interface Props {
  form: AgentEditorForm
  setForm: (updater: (f: AgentEditorForm) => AgentEditorForm) => void
  agentId?: string
}

type PromptKey = 'main' | 'context' | 'data_update' | 'formatting' | 'validator'

const PROMPT_BLOCKS: Array<{ key: PromptKey; title: string; hint: string; placeholder: string; juliaDefault: string; juliaHint: string }> = [
  {
    key: 'main', title: '1. Instruções do agente (conversa com cliente)',
    hint: 'Complementa os campos estruturados (Regras de negócio, Funil, Cenários). Use para VIAJANTE, scripts específicos e nuances que não cabem nos outros campos. Campos como taxa, processo e Club Med já viram prompt automaticamente — não precisa repetir aqui.',
    placeholder: 'Ex: regras de VIAJANTE, script específico de Club Med, tom especial...',
    juliaDefault: JULIA_PROMPT_MAIN,
    juliaHint: 'Template completo estilo Julia: papel SDR vs Consultora, regras de VIAJANTE, não-repetição de formulário, fluxo Club Med, critérios de qualificação e desqualificação.',
  },
  {
    key: 'context', title: '2. Prompt de contexto (atualiza ai_resumo/ai_contexto)',
    hint: 'Usado APENAS pelo agente de backoffice que mantém o resumo e a cronologia do card atualizados. Não afeta a resposta ao cliente.',
    placeholder: 'Consolide o contexto do card olhando o histórico...',
    juliaDefault: JULIA_PROMPT_CONTEXT,
    juliaHint: 'Regras de o que entra/não entra em ai_resumo, cronologia em ai_contexto, regra VIAJANTE ([Viajante: X]).',
  },
  {
    key: 'data_update', title: '3. Prompt de atualização de dados (escrita no CRM)',
    hint: 'Usado APENAS pelo agente que grava campos no card/contato. Não afeta a resposta ao cliente.',
    placeholder: 'Atualize apenas os campos listados em Contexto & Campos quando houver evidência clara...',
    juliaDefault: JULIA_PROMPT_DATA_UPDATE,
    juliaHint: 'Colunas permitidas, regras de estágio (Tentativa → Conectado → Reunião Agendada), normalização de CPF/data/email.',
  },
  {
    key: 'formatting', title: '4. Prompt de formatação (quebra em blocos WhatsApp)',
    hint: 'Usado APENAS pelo agente que divide a resposta em 1-3 blocos antes de enviar. Não afeta o que a IA fala, só como quebra.',
    placeholder: 'Divida a resposta em até 3 blocos. Use *negrito* para destaques...',
    juliaDefault: JULIA_PROMPT_FORMATTING,
    juliaHint: 'Regras de divisão em 3 blocos, markdown WhatsApp (*negrito*, ~tachado~, `link`), pergunta em bloco separado.',
  },
  {
    key: 'validator', title: '5. Prompt do validador (revisão antes de enviar)',
    hint: 'Usado APENAS pelo agente que revisa cada mensagem antes de mandar. As regras da aba "Regras do validador" já são enviadas automaticamente — use este campo só para instruções extras.',
    placeholder: 'Antes de liberar a resposta: verifique se não menciona que é IA...',
    juliaDefault: JULIA_PROMPT_VALIDATOR,
    juliaHint: 'Os 8 checks da Julia: menção a IA, inventar fatos, tom robótico, repetir apresentação, mencionar sistema, rejeitar cedo, "não trabalhamos isolado", Club Med taxa/reunião.',
  },
]

export function TabPrompts({ form, setForm, agentId }: Props) {
  const refs = useRef<Record<string, FieldAwareTextareaHandle | null>>({})
  const focusedKey = useRef<PromptKey>('main')

  // Pipeline + produto do próprio agente (não do contexto da sessão), pra garantir
  // que o @-autocomplete sempre mostre os campos corretos do produto do agente.
  const { data: agent } = useAiAgentDetail(agentId)
  const { products } = useProducts()
  const produto = (agent as { produto?: string } | undefined)?.produto
  const pipelineId = products.find(p => p.slug === produto)?.pipeline_id ?? undefined

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
    refs.current[key]?.insertAtCursor(token)
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
          O prompt final é montado <strong>automaticamente</strong> a partir das outras abas (Identidade, Regras de negócio, Funil, Cenários, Handoff, Decisões, Ferramentas). Os cinco blocos abaixo são <strong>complementos</strong> — cada um entra num momento diferente do pipeline. Bloco #1 roda junto da resposta ao cliente; blocos #2-#5 rodam em agentes dedicados (backoffice, dados, formatação, validação).
        </p>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
          <p className="font-medium">O que já está automático (não precisa repetir aqui):</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Nome, tipo e persona vão da aba <strong>Identidade</strong></li>
            <li>Taxa, processo e metodologia vão da aba <strong>Regras de negócio</strong></li>
            <li>Perguntas de qualificação vão da aba <strong>Funil de qualificação</strong></li>
            <li>Club Med e outros cenários vão da aba <strong>Cenários especiais</strong></li>
            <li>Sinais de handoff, decisões inteligentes e regras do validador vêm das suas respectivas abas</li>
          </ul>
        </div>
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
          <FieldAwareTextarea
            ref={(h: FieldAwareTextareaHandle | null) => { refs.current[block.key] = h }}
            value={getValue(block.key)}
            onChange={v => setValue(block.key, v)}
            onFocus={() => { focusedKey.current = block.key }}
            placeholder={block.placeholder}
            rows={block.key === 'main' ? 12 : 6}
            pipelineId={pipelineId}
            produto={produto}
            className="font-mono"
          />
          <p className="text-[11px] text-slate-400">
            Digite <kbd className="rounded border border-slate-300 bg-slate-50 px-1 py-0.5 font-mono text-[10px]">@</kbd> para inserir um campo do CRM. {getValue(block.key).length} caracteres.
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
