import { useEffect, useState } from 'react'
import { Loader2, Save, Database, ChevronDown, ChevronRight, X, Plus, Sparkle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useAgentDataUpdateRules,
  type DataUpdateRule,
} from '@/hooks/v2/playbook/useAgentDataUpdateRules'
import { VariableTextarea } from '../../shared/VariableTextarea'

interface Props {
  agentId: string
  produto?: string | null
}

/**
 * Editor estruturado das regras de gravação de dados no CRM. Cada regra
 * vira um card expansível com título + instrução (suporta variáveis CRM).
 *
 * Substitui o textão de 2.500 chars que vivia em prompts_extra.data_update
 * (aba "Prompts" do layout antigo). Quando o admin não tem nenhuma regra
 * aqui, o router faz fallback pro texto legado.
 */
export function DataUpdateRulesSection({ agentId, produto }: Props) {
  const { rules, isLoading, save } = useAgentDataUpdateRules(agentId)
  const [local, setLocal] = useState<DataUpdateRule[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [dirty, setDirty] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLocal(rules)
    setDirty(false)
  }, [rules])
  /* eslint-enable react-hooks/set-state-in-effect */

  const sorted = [...local].sort((a, b) => a.order - b.order)
  const enabledCount = sorted.filter((r) => r.enabled).length

  const updateRule = (key: string, patch: Partial<DataUpdateRule>) => {
    setLocal((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const removeRule = (key: string) => {
    setLocal((prev) => prev.filter((r) => r.key !== key))
    setExpanded((s) => {
      const next = { ...s }
      delete next[key]
      return next
    })
    setDirty(true)
  }

  const addRule = () => {
    const nextOrder = Math.max(0, ...local.map((r) => r.order)) + 1
    const newKey = `rule_${Date.now().toString(36).slice(-5)}`
    setLocal((prev) => [
      ...prev,
      { key: newKey, title: '', instruction: '', enabled: true, order: nextOrder },
    ])
    setExpanded((s) => ({ ...s, [newKey]: true }))
    setDirty(true)
  }

  const moveUp = (idx: number) => {
    if (idx === 0) return
    const next = [...sorted]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    next.forEach((r, i) => (r.order = i + 1))
    setLocal(next)
    setDirty(true)
  }

  const moveDown = (idx: number) => {
    if (idx === sorted.length - 1) return
    const next = [...sorted]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    next.forEach((r, i) => (r.order = i + 1))
    setLocal(next)
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      await save.mutateAsync(local)
      toast.success('Regras de gravação salvas')
      setDirty(false)
    } catch (err) {
      console.error('[DataUpdateRulesSection] save error:', err)
      toast.error('Não consegui salvar.')
    }
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin inline" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
          <Database className="w-4 h-4 text-sky-600" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Como ela grava dados no CRM</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Regras de gravação que o agente segue antes de atualizar campos do card/contato:
            normalização de números, conversão de moeda, "nunca null", etc.
            {sorted.length > 0 && (
              <span className="ml-1 text-slate-400">
                · {enabledCount} ativa{enabledCount === 1 ? '' : 's'} de {sorted.length}
              </span>
            )}
          </p>
        </div>
        <Button onClick={addRule} variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> Nova regra
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
          <Sparkle className="w-5 h-5 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nenhuma regra configurada.</p>
          <p className="text-xs text-slate-400 mt-1">
            Sem regras aqui, o agente segue o comportamento legado
            (texto em <code className="bg-slate-100 px-1 rounded">prompts_extra.data_update</code>).
          </p>
          <Button onClick={addRule} variant="outline" size="sm" className="gap-1.5 mt-3">
            <Plus className="w-3.5 h-3.5" /> Adicionar primeira regra
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((r, idx) => {
            const isOpen = expanded[r.key] ?? false
            return (
              <li
                key={r.key}
                className={cn(
                  'rounded-lg border bg-white transition-colors',
                  r.enabled ? 'border-sky-200' : 'border-slate-100 bg-slate-50/50',
                )}
              >
                {/* Header */}
                <div className="flex items-center gap-2 p-2.5">
                  <div className="flex flex-col flex-shrink-0">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                      title="Mover pra cima"
                    >
                      <ChevronRight className="w-3 h-3 rotate-[-90deg]" />
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === sorted.length - 1}
                      className="text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                      title="Mover pra baixo"
                    >
                      <ChevronRight className="w-3 h-3 rotate-90" />
                    </button>
                  </div>

                  <span
                    className={cn(
                      'flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold',
                      r.enabled ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-400',
                    )}
                  >
                    {idx + 1}
                  </span>

                  <button
                    onClick={() => setExpanded((s) => ({ ...s, [r.key]: !s[r.key] }))}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span
                      className={cn(
                        'text-sm',
                        r.enabled ? 'text-slate-900 font-medium' : 'text-slate-400 line-through',
                      )}
                    >
                      {r.title || <span className="italic text-slate-400">Regra sem título</span>}
                    </span>
                  </button>

                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={() => updateRule(r.key, { enabled: !r.enabled })}
                    className="flex-shrink-0 cursor-pointer"
                    title={r.enabled ? 'Desativar' : 'Ativar'}
                  />

                  <button
                    onClick={() => setExpanded((s) => ({ ...s, [r.key]: !s[r.key] }))}
                    className="text-slate-400 hover:text-slate-700 flex-shrink-0"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => removeRule(r.key)}
                    className="text-slate-300 hover:text-rose-600 flex-shrink-0"
                    title="Remover"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Body expandido */}
                {isOpen && (
                  <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50/30">
                    <div>
                      <label className="block text-[11px] text-slate-600 font-medium mb-1">
                        Título (1 linha)
                      </label>
                      <input
                        type="text"
                        value={r.title}
                        onChange={(e) => updateRule(r.key, { title: e.target.value })}
                        placeholder="Ex: Nunca gravar valor null"
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 font-medium mb-1">
                        Instrução (suporta variáveis do CRM)
                      </label>
                      <VariableTextarea
                        value={r.instruction}
                        onChange={(text) => updateRule(r.key, { instruction: text })}
                        produto={produto}
                        rows={4}
                        placeholder="Descreva a regra. Use o botão 'Inserir variável' pra referenciar campos do CRM."
                      />
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex justify-end pt-2 border-t border-slate-100">
        {dirty && <span className="text-xs text-amber-600 self-center mr-3">• alterações não salvas</span>}
        <Button onClick={handleSave} disabled={!dirty || save.isPending} size="sm" className="gap-1.5">
          {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
        </Button>
      </div>
    </div>
  )
}
