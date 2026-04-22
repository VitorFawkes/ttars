import { useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { TripItemInterno } from '@/hooks/viagem/useViagemInterna'
import { useUpdateTripItem } from '@/hooks/viagem/useViagemInterna'
import type { TripItemAlternativa } from '@/types/viagem'

interface Props {
  item: TripItemInterno
}

export function AlternativasEditor({ item }: Props) {
  const updateItem = useUpdateTripItem()
  const alts: TripItemAlternativa[] = item.alternativas ?? []

  const save = (next: TripItemAlternativa[]) => {
    updateItem.mutate({ id: item.id, alternativas: next })
  }

  const handleAdd = () => {
    const novo: TripItemAlternativa = {
      id: crypto.randomUUID(),
      titulo: `Opção ${alts.length + 1}`,
      preco: undefined,
      comercial: {},
    }
    save([...alts, novo])
  }

  const handleRemove = (id: string) => {
    save(alts.filter((a) => a.id !== id))
  }

  const handlePatch = (id: string, patch: Partial<TripItemAlternativa>) => {
    save(alts.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  if (alts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center">
        <p className="text-xs text-slate-500">
          Nenhuma alternativa. O cliente aprova este item como está.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="mt-2 gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Oferecer opções
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alts.map((alt) => (
        <AlternativaRow
          key={alt.id}
          alt={alt}
          onRemove={() => handleRemove(alt.id)}
          onPatch={(patch) => handlePatch(alt.id, patch)}
        />
      ))}
      <Button variant="outline" size="sm" onClick={handleAdd} className="w-full gap-1">
        <Plus className="h-3.5 w-3.5" />
        Adicionar opção
      </Button>
    </div>
  )
}

function AlternativaRow({
  alt,
  onRemove,
  onPatch,
}: {
  alt: TripItemAlternativa
  onRemove: () => void
  onPatch: (patch: Partial<TripItemAlternativa>) => void
}) {
  const [titulo, setTitulo] = useState(alt.titulo)
  const [preco, setPreco] = useState(alt.preco != null ? String(alt.preco) : '')
  const isEscolhida = !!alt.escolhido_em

  return (
    <div className={`rounded-md border px-3 py-2 ${isEscolhida ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => onPatch({ titulo })}
            placeholder="Ex: Hotel Le Bristol"
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">R$</span>
            <input
              type="number"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              onBlur={() => onPatch({ preco: preco ? Number(preco) : undefined })}
              placeholder="0,00"
              className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {isEscolhida && (
              <span className="flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <Check className="h-3 w-3" />
                Escolhida pelo cliente
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={isEscolhida}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
          aria-label="Remover alternativa"
          title={isEscolhida ? 'Cliente já escolheu esta — remova a escolha antes' : 'Remover'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
