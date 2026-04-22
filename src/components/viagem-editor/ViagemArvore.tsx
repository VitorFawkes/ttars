import { useMemo } from 'react'
import { Hotel, Plane, Car, MapPin, UtensilsCrossed, ShieldCheck, Lightbulb, FileText, Contact, CheckSquare, Ticket, Plus, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { TripItemTipo } from '@/types/viagem'
import type { TripItemInterno } from '@/hooks/viagem/useViagemInterna'

const TIPO_ICON: Record<TripItemTipo, typeof Hotel> = {
  dia: MapPin,
  hotel: Hotel,
  voo: Plane,
  transfer: Car,
  passeio: MapPin,
  refeicao: UtensilsCrossed,
  seguro: ShieldCheck,
  dica: Lightbulb,
  voucher: Ticket,
  contato: Contact,
  texto: FileText,
  checklist: CheckSquare,
}

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'bg-slate-100 text-slate-600' },
  proposal: { label: 'Proposta', color: 'bg-blue-100 text-blue-700' },
  financeiro: { label: 'Produto-Vendas', color: 'bg-emerald-100 text-emerald-700' },
  library: { label: 'Biblioteca', color: 'bg-violet-100 text-violet-700' },
}

interface Props {
  items: TripItemInterno[]
  selectedId: string | null
  onSelect: (itemId: string) => void
  onAddDay: () => void
  onAddItem: (parentId: string | null) => void
  onDelete: (itemId: string) => void
}

export function ViagemArvore({ items, selectedId, onSelect, onAddDay, onAddItem, onDelete }: Props) {
  const { dias, orfaos } = useMemo(() => {
    const dias = items.filter((i) => i.tipo === 'dia').sort((a, b) => a.ordem - b.ordem)
    const naoDias = items.filter((i) => i.tipo !== 'dia')
    const parentIds = new Set(dias.map((d) => d.id))
    const orfaos = naoDias
      .filter((i) => !i.parent_id || !parentIds.has(i.parent_id))
      .sort((a, b) => a.ordem - b.ordem)
    return { dias, orfaos }
  }, [items])

  const tituloItem = (item: TripItemInterno) => {
    const c = item.comercial as { titulo?: string; descricao?: string }
    return c.titulo || c.descricao || `Item ${item.tipo}`
  }

  const renderItem = (item: TripItemInterno, dentroDia: boolean) => {
    const Icon = TIPO_ICON[item.tipo] ?? FileText
    const sourceBadge = item.source_type ? SOURCE_BADGE[item.source_type] : null
    const selected = selectedId === item.id
    return (
      <div
        key={item.id}
        className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
          selected ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-slate-50 text-slate-700'
        } ${dentroDia ? 'ml-5' : ''}`}
      >
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <GripVertical className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100" />
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">{tituloItem(item)}</span>
          {sourceBadge && (
            <span className={`ml-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${sourceBadge.color}`}>
              {sourceBadge.label}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          aria-label="Apagar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estrutura</h2>
        <Button size="sm" variant="outline" onClick={onAddDay} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Dia
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {orfaos.length > 0 && (
          <div className="mb-3">
            {orfaos.map((i) => renderItem(i, false))}
            <button
              type="button"
              onClick={() => onAddItem(null)}
              className="ml-0 mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              <Plus className="h-3 w-3" />
              Adicionar item avulso
            </button>
          </div>
        )}

        {dias.map((dia) => {
          const filhos = items
            .filter((i) => i.parent_id === dia.id)
            .sort((a, b) => a.ordem - b.ordem)
          return (
            <div key={dia.id} className="mb-3">
              {renderItem(dia, false)}
              {filhos.map((f) => renderItem(f, true))}
              <button
                type="button"
                onClick={() => onAddItem(dia.id)}
                className="ml-5 mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <Plus className="h-3 w-3" />
                Adicionar item
              </button>
            </div>
          )
        })}

        {dias.length === 0 && orfaos.length === 0 && (
          <div className="mt-6 text-center text-xs text-slate-500">
            <p>Nenhum item ainda.</p>
            <p className="mt-1">Clique em <span className="font-medium">+ Dia</span> ou adicione um item avulso.</p>
          </div>
        )}
      </div>
    </div>
  )
}
