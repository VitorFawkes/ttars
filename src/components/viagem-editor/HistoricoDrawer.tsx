import { useMemo } from 'react'
import { X, History, User } from 'lucide-react'
import { useTripItemHistory } from '@/hooks/viagem/useTripItemHistory'
import type { TripItemHistoryRow } from '@/hooks/viagem/useTripItemHistory'

interface Props {
  itemId: string | null
  open: boolean
  onClose: () => void
}

function formatRelative(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `há ${Math.floor(diff / 86400)} dia${Math.floor(diff / 86400) > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('pt-BR')
}

const PAPEL_LABEL: Record<string, string> = {
  tp: 'Travel Planner',
  pv: 'Pós-Venda',
  sistema: 'Sistema',
  client: 'Cliente',
}

const PAPEL_COLOR: Record<string, string> = {
  tp: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  pv: 'bg-violet-50 text-violet-700 border-violet-100',
  sistema: 'bg-slate-50 text-slate-600 border-slate-100',
  client: 'bg-emerald-50 text-emerald-700 border-emerald-100',
}

const CAMPO_LABEL: Record<string, string> = {
  comercial: 'Informações do cliente',
  operacional: 'Informações operacionais',
  status: 'Status do item',
  alternativas: 'Opções para o cliente',
}

function summarizeValue(campo: string, valor: unknown): string {
  if (valor == null) return '—'
  if (campo === 'status') return String(valor)
  if (campo === 'comercial' || campo === 'operacional') {
    const obj = valor as Record<string, unknown>
    if (typeof obj !== 'object') return String(valor)
    const keys = Object.keys(obj).filter((k) => obj[k] != null && obj[k] !== '')
    if (keys.length === 0) return 'vazio'
    return keys.slice(0, 3).map((k) => `${k}: ${formatPrimitive(obj[k])}`).join(' · ')
  }
  if (campo === 'alternativas') {
    const arr = Array.isArray(valor) ? valor : []
    return arr.length === 0 ? 'nenhuma' : `${arr.length} opção${arr.length > 1 ? 'ões' : ''}`
  }
  return JSON.stringify(valor).slice(0, 60)
}

function formatPrimitive(v: unknown): string {
  if (typeof v === 'string') return v.length > 30 ? v.slice(0, 30) + '…' : v
  if (Array.isArray(v)) return `[${v.length}]`
  if (typeof v === 'object') return '{...}'
  return String(v)
}

export function HistoricoDrawer({ itemId, open, onClose }: Props) {
  const { data: history = [], isLoading } = useTripItemHistory(open ? itemId : null)

  const grouped = useMemo(() => {
    // Agrupa por "edição" (mesmo autor + dentro de 5s)
    const out: { key: string; rows: TripItemHistoryRow[] }[] = []
    let current: { key: string; rows: TripItemHistoryRow[] } | null = null
    for (const row of history) {
      const sig = `${row.autor ?? 'null'}-${Math.floor(new Date(row.created_at).getTime() / 5000)}`
      if (!current || current.key !== sig) {
        current = { key: sig, rows: [] }
        out.push(current)
      }
      current.rows.push(row)
    }
    return out
  }, [history])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Histórico do item</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <p className="text-center text-xs text-slate-400">Carregando...</p>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-slate-400">
              <History className="h-8 w-8 text-slate-300" />
              <p>Nenhuma edição registrada ainda.</p>
            </div>
          ) : (
            <ol className="space-y-3">
              {grouped.map((g) => {
                const first = g.rows[0]
                const papelKey = first.papel ?? 'sistema'
                const papelLabel = PAPEL_LABEL[papelKey] ?? papelKey
                const papelColor = PAPEL_COLOR[papelKey] ?? PAPEL_COLOR.sistema
                const nome = first.autor_nome ?? papelLabel
                return (
                  <li key={g.key} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {first.autor_avatar ? (
                          <img src={first.autor_avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            <User className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-slate-900">{nome}</p>
                          <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${papelColor}`}>
                            {papelLabel}
                          </span>
                        </div>
                      </div>
                      <time className="shrink-0 text-[11px] text-slate-500">
                        {formatRelative(first.created_at)}
                      </time>
                    </div>
                    <ul className="space-y-1.5 text-xs">
                      {g.rows.map((r) => (
                        <li key={r.id} className="rounded bg-slate-50 px-2 py-1.5">
                          <p className="mb-0.5 font-medium text-slate-700">
                            {CAMPO_LABEL[r.campo] ?? r.campo}
                          </p>
                          <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                            <span>antes:</span>
                            <span className="truncate text-slate-700">{summarizeValue(r.campo, r.valor_anterior)}</span>
                            <span>depois:</span>
                            <span className="truncate text-slate-900">{summarizeValue(r.campo, r.valor_novo)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </aside>
    </>
  )
}

interface TriggerProps {
  itemId: string | null
  lastEdited?: { at: string; papel: string | null; autor_nome: string | null } | null
  onOpen: () => void
}

export function HistoricoFooterTrigger({ itemId, lastEdited, onOpen }: TriggerProps) {
  if (!itemId) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    >
      <span className="flex items-center gap-1">
        <History className="h-3 w-3" />
        {lastEdited
          ? `Editado por ${lastEdited.autor_nome ?? (PAPEL_LABEL[lastEdited.papel ?? 'sistema'] ?? 'sistema')} ${formatRelative(lastEdited.at)}`
          : 'Ver histórico'}
      </span>
      <span className="text-slate-400 hover:text-slate-700">ver histórico →</span>
    </button>
  )
}
