import { useState, useRef, useEffect } from 'react'
import { Check, X, Plus, ListChecks } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { ChecklistItem } from '../../../hooks/concierge/types'

interface ChecklistEditorProps {
  itens: ChecklistItem[]
  readOnly?: boolean
  onChange: (proximos: ChecklistItem[]) => void
}

function novoId(): string {
  // crypto.randomUUID disponível em todos os browsers atuais
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function ordenado(itens: ChecklistItem[]): ChecklistItem[] {
  return [...itens].sort((a, b) => a.ordem - b.ordem)
}

export function ChecklistEditor({ itens, readOnly = false, onChange }: ChecklistEditorProps) {
  const lista = ordenado(itens)
  const total = lista.length
  const feitos = lista.filter(i => i.feito).length
  const tudoFeito = total > 0 && feitos === total

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [textoEdicao, setTextoEdicao] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editandoId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editandoId])

  const startEdit = (item: ChecklistItem) => {
    if (readOnly) return
    setEditandoId(item.id)
    setTextoEdicao(item.texto)
  }

  const commitEdit = () => {
    if (!editandoId) return
    const textoLimpo = textoEdicao.trim()
    if (!textoLimpo) {
      // texto vazio = remove o item (a menos que seja o único caso de criação)
      onChange(lista.filter(i => i.id !== editandoId))
    } else {
      onChange(lista.map(i => i.id === editandoId ? { ...i, texto: textoLimpo } : i))
    }
    setEditandoId(null)
    setTextoEdicao('')
  }

  const cancelEdit = () => {
    // Se era um item novo (texto vazio), remove
    const item = lista.find(i => i.id === editandoId)
    if (item && !item.texto.trim()) {
      onChange(lista.filter(i => i.id !== editandoId))
    }
    setEditandoId(null)
    setTextoEdicao('')
  }

  const toggleItem = (id: string) => {
    if (readOnly) return
    onChange(lista.map(i => i.id === id ? { ...i, feito: !i.feito } : i))
  }

  const removerItem = (id: string) => {
    if (readOnly) return
    const item = lista.find(i => i.id === id)
    if (!item) return
    if (item.texto.trim() && !window.confirm('Remover este item?')) return
    onChange(lista.filter(i => i.id !== id))
  }

  const adicionarItem = () => {
    if (readOnly) return
    const maxOrdem = lista.reduce((max, i) => Math.max(max, i.ordem), -1)
    const novo: ChecklistItem = {
      id: novoId(),
      texto: '',
      feito: false,
      ordem: maxOrdem + 1,
    }
    onChange([...lista, novo])
    setEditandoId(novo.id)
    setTextoEdicao('')
  }

  return (
    <div className={cn(
      'border rounded-lg p-3 space-y-2',
      tudoFeito ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide font-semibold text-slate-500">
          <ListChecks className="w-3.5 h-3.5" />
          Checklist
        </div>
        {total > 0 && (
          <span className={cn(
            'font-mono text-[11px] font-semibold px-1.5 h-5 inline-flex items-center rounded-md',
            tudoFeito ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-600'
          )}>
            {feitos}/{total}
          </span>
        )}
      </div>

      {total === 0 && !readOnly && (
        <p className="text-[11.5px] text-slate-500 italic">
          Sem itens. Adicione passos pra organizar a tarefa (ex: cada ingresso, cada parada da viagem…).
        </p>
      )}

      {lista.length > 0 && (
        <ul className="space-y-1">
          {lista.map(item => {
            const editando = editandoId === item.id
            return (
              <li
                key={item.id}
                className={cn(
                  'group flex items-start gap-2 px-2 py-1 rounded transition-colors',
                  !readOnly && 'hover:bg-white'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  disabled={readOnly}
                  className={cn(
                    'mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors',
                    item.feito
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-300 hover:border-slate-400',
                    readOnly && 'cursor-default'
                  )}
                  aria-label={item.feito ? 'Desmarcar item' : 'Marcar como feito'}
                >
                  {item.feito && <Check className="w-3 h-3" strokeWidth={3} />}
                </button>

                {editando ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={textoEdicao}
                    onChange={(e) => setTextoEdicao(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitEdit()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                    placeholder="Descreva o item…"
                    className="flex-1 min-w-0 text-[12.5px] bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    disabled={readOnly}
                    className={cn(
                      'flex-1 min-w-0 text-left text-[12.5px] leading-snug break-words',
                      item.feito ? 'text-slate-400 line-through' : 'text-slate-800',
                      !readOnly && 'hover:text-indigo-700 cursor-text'
                    )}
                  >
                    {item.texto || <span className="italic text-slate-400">(sem descrição)</span>}
                  </button>
                )}

                {!readOnly && !editando && (
                  <button
                    type="button"
                    onClick={() => removerItem(item.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-red-600 transition-opacity p-0.5"
                    aria-label="Remover item"
                    title="Remover item"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={adicionarItem}
          className="flex items-center gap-1.5 text-[11.5px] font-medium text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded hover:bg-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar item
        </button>
      )}
    </div>
  )
}
