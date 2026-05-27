import { useEffect, useState } from 'react'
import { Plus, Trash2, Phone, Mail, Heart, Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../../ui/sheet'
import { cn } from '../../../lib/utils'
import { formatPhoneBR } from '../../../utils/normalizePhone'
import { useUpsertGuestExtras } from '../../../hooks/convidados/useUpsertGuestExtras'
import {
  EXTRA_STATUS_LABEL,
  EXTRA_STATUS_ORDER,
  type ExtraItem,
  type ExtraStatus,
  type GuestExtra,
} from '../../../hooks/convidados/types'

const STATUS_CHIP: Record<ExtraStatus, string> = {
  oferecido: 'bg-slate-100 text-slate-700 border-slate-200',
  interessado: 'bg-sky-50 text-sky-700 border-sky-200',
  confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pago: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

function newItem(): ExtraItem {
  return { id: crypto.randomUUID(), descricao: '', valor: null }
}

interface ExtrasDetailSheetProps {
  guest: GuestExtra | null
  open: boolean
  onClose: () => void
}

export function ExtrasDetailSheet({ guest, open, onClose }: ExtrasDetailSheetProps) {
  const upsert = useUpsertGuestExtras()
  const [status, setStatus] = useState<ExtraStatus>('oferecido')
  const [itens, setItens] = useState<ExtraItem[]>([])
  const [observacoes, setObservacoes] = useState('')

  // Recarrega o formulário sempre que abrir um convidado diferente.
  useEffect(() => {
    if (!guest) return
    setStatus(guest.extras_status)
    setItens(guest.itens.length > 0 ? guest.itens : [])
    setObservacoes(guest.observacoes ?? '')
  }, [guest])

  if (!guest) return null

  const fullName = `${guest.nome}${guest.sobrenome ? ` ${guest.sobrenome}` : ''}`

  const updateItem = (id: string, patch: Partial<ExtraItem>) => {
    setItens((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }
  const removeItem = (id: string) => setItens((prev) => prev.filter((it) => it.id !== id))
  const addItem = () => setItens((prev) => [...prev, newItem()])

  const handleSave = () => {
    // Descarta linhas vazias antes de salvar.
    const limpos = itens
      .map((it) => ({ ...it, descricao: it.descricao.trim() }))
      .filter((it) => it.descricao.length > 0)
    upsert.mutate(
      {
        guest_id: guest.guest_id,
        status,
        itens: limpos,
        observacoes: observacoes.trim() || null,
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-slate-100">
          <SheetTitle className="text-slate-900">{fullName}</SheetTitle>
          <SheetDescription className="flex flex-col gap-1 text-slate-500">
            {guest.casamento_nome && (
              <span className="inline-flex items-center gap-1.5">
                <Heart className="w-3 h-3 text-rose-400" />
                {guest.casamento_nome}
              </span>
            )}
            {guest.telefone && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Phone className="w-3 h-3" />
                {formatPhoneBR(guest.telefone)}
              </span>
            )}
            {guest.email && (
              <span className="inline-flex items-center gap-1.5 truncate">
                <Mail className="w-3 h-3" />
                {guest.email}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Status */}
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">Estágio</label>
            <div className="flex flex-wrap gap-1.5">
              {EXTRA_STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    'px-2.5 h-7 text-xs font-medium rounded-md border transition-colors',
                    status === s
                      ? STATUS_CHIP[s]
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
                  )}
                >
                  {EXTRA_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Itens (texto livre) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700">Extras oferecidos</label>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {itens.length === 0 && (
                <p className="text-[11px] text-slate-400 italic py-2">
                  Nenhum extra ainda. Clique em "Adicionar" para incluir um passeio, restaurante…
                </p>
              )}
              {itens.map((it) => (
                <div key={it.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={it.descricao}
                    onChange={(e) => updateItem(it.id, { descricao: e.target.value })}
                    placeholder="Ex: Passeio de barco"
                    className="flex-1 min-w-0 h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <div className="relative w-24 shrink-0">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                      R$
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={it.valor ?? ''}
                      onChange={(e) =>
                        updateItem(it.id, {
                          valor: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="0,00"
                      className="w-full h-8 pl-7 pr-2 text-sm text-right border border-slate-200 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded text-rose-500 hover:bg-rose-50 shrink-0"
                    aria-label="Remover extra"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">Observações</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              placeholder="Notas internas sobre os extras desse convidado…"
              className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        </div>

        <SheetFooter className="px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 h-9 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-md"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={upsert.isPending}
            className="inline-flex items-center gap-1.5 px-4 h-9 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-60"
          >
            {upsert.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salvar
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
