import { useState } from 'react'
import { Loader2, Plus, GripVertical, ChevronDown, ChevronRight, X, Save, Sparkle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { IdentityPrinciple } from '@/hooks/v2/playbook/useAgentIdentity'
import { VariableTextarea } from '../../shared/VariableTextarea'

interface Props {
  /** Valor controlado pelo pai (IdentitySection). */
  value: IdentityPrinciple[]
  onChange: (next: IdentityPrinciple[]) => void
  /** Produto do agente — define quais variáveis CRM aparecem no dropdown. */
  produto?: string | null
  /** Quando salvando (do save mutation do pai). */
  saving?: boolean
  /** Callback opcional pra salvar imediatamente. Se ausente, pai salva no botão Save. */
  onSave?: () => void
}

/**
 * Editor estruturado dos princípios de caráter — substitui o textarea mono.
 *
 * Cada princípio é um card expansível:
 *   - Título (1 linha, editável inline)
 *   - Body (VariableTextarea — suporta variáveis {curly}/<angle>)
 *   - Toggle ativo/desativado
 *   - Drag handle pra reordenar (não implementado nesta versão — usa setas)
 *   - Botão remover
 *
 * Cards colapsam mostrando só o título (cor cinza quando desabilitado).
 * Botão "+ Novo princípio" cria card em branco no fim da lista.
 */
export function PrinciplesEditor({ value, onChange, produto, saving, onSave }: Props) {
  // Expansão controlada localmente — auto-expande novo princípio recém-criado
  // via addPrinciple (sem useEffect; abre direto na criação).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggleExpanded = (key: string) =>
    setExpanded((s) => ({ ...s, [key]: !s[key] }))

  const updatePrinciple = (key: string, patch: Partial<IdentityPrinciple>) => {
    onChange(value.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  const removePrinciple = (key: string) => {
    onChange(value.filter((p) => p.key !== key))
    setExpanded((s) => {
      const next = { ...s }
      delete next[key]
      return next
    })
  }

  const addPrinciple = () => {
    const nextOrder = Math.max(0, ...value.map((p) => p.order)) + 1
    const newKey = `principle_${Date.now().toString(36).slice(-5)}`
    const next: IdentityPrinciple = {
      key: newKey,
      title: '',
      body: '',
      enabled: true,
      order: nextOrder,
    }
    onChange([...value, next])
    setExpanded((s) => ({ ...s, [newKey]: true }))
  }

  const moveUp = (idx: number) => {
    if (idx === 0) return
    const next = [...value]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    next.forEach((p, i) => (p.order = i + 1))
    onChange(next)
  }

  const moveDown = (idx: number) => {
    if (idx === value.length - 1) return
    const next = [...value]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    next.forEach((p, i) => (p.order = i + 1))
    onChange(next)
  }

  // Ordena pra render por `order`
  const sorted = [...value].sort((a, b) => a.order - b.order)
  const enabledCount = sorted.filter((p) => p.enabled).length

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-slate-900">Princípios de caráter</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Como o agente pensa. Cada princípio vira uma instrução no prompt — usa variáveis pra referenciar campos do CRM e blocos do engine.
            {sorted.length > 0 && (
              <span className="ml-1 text-slate-400">
                · {enabledCount} ativo{enabledCount === 1 ? '' : 's'} de {sorted.length}
              </span>
            )}
          </p>
        </div>
        <Button onClick={addPrinciple} variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> Novo princípio
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-6 text-center">
          <Sparkle className="w-5 h-5 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nenhum princípio ainda.</p>
          <p className="text-xs text-slate-400 mt-1">
            Use princípios pra dar caráter ao agente — "Não invento o que não sei", "Releio antes de repetir", etc.
          </p>
          <Button onClick={addPrinciple} variant="outline" size="sm" className="gap-1.5 mt-3">
            <Plus className="w-3.5 h-3.5" /> Adicionar primeiro princípio
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((p, idx) => {
            const isOpen = expanded[p.key] ?? false
            return (
              <li
                key={p.key}
                className={cn(
                  'rounded-lg border bg-white transition-colors',
                  p.enabled ? 'border-slate-200' : 'border-slate-100 bg-slate-50/50',
                )}
              >
                {/* Header */}
                <div className="flex items-center gap-2 p-2.5">
                  {/* Drag handle (visual — usa botões move up/down até ter dnd-kit) */}
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
                  <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />

                  {/* Número */}
                  <span
                    className={cn(
                      'flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold',
                      p.enabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-400',
                    )}
                  >
                    {idx + 1}
                  </span>

                  {/* Título — clica pra expandir */}
                  <button
                    onClick={() => toggleExpanded(p.key)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span
                      className={cn(
                        'text-sm',
                        p.enabled ? 'text-slate-900 font-medium' : 'text-slate-400 line-through',
                      )}
                    >
                      {p.title || <span className="italic text-slate-400">Princípio sem título</span>}
                    </span>
                  </button>

                  {/* Toggle */}
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={() => updatePrinciple(p.key, { enabled: !p.enabled })}
                    className="flex-shrink-0 cursor-pointer"
                    title={p.enabled ? 'Desativar' : 'Ativar'}
                  />

                  {/* Expand caret */}
                  <button
                    onClick={() => toggleExpanded(p.key)}
                    className="text-slate-400 hover:text-slate-700 flex-shrink-0"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {/* Remover */}
                  <button
                    onClick={() => removePrinciple(p.key)}
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
                        value={p.title}
                        onChange={(e) => updatePrinciple(p.key, { title: e.target.value })}
                        placeholder="Ex: Eu não invento o que não sei"
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 font-medium mb-1">
                        Descrição (suporta variáveis do CRM e blocos do engine)
                      </label>
                      <VariableTextarea
                        value={p.body}
                        onChange={(text) => updatePrinciple(p.key, { body: text })}
                        produto={produto}
                        rows={4}
                        placeholder="Explique o princípio. Use o botão 'Inserir variável' pra referenciar campos do contato, do card ou blocos do engine."
                      />
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {onSave && (
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <Button onClick={onSave} disabled={saving} size="sm" className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar princípios
          </Button>
        </div>
      )}
    </div>
  )
}
