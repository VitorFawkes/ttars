import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TripItem } from '@/types/viagem'

interface AlternativesCarouselProps {
  item: TripItem
  onChoose: (alternativaId: string) => void
}

export function AlternativesCarousel({ item, onChoose }: AlternativesCarouselProps) {
  const alternatives = item.alternativas

  if (alternatives.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        Escolha uma opção
      </p>
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
        {alternatives.map((alt) => {
          const isChosen = !!alt.escolhido_em
          const comercial = (alt.comercial ?? {}) as Record<string, string | number | string[] | undefined>
          const fotos = (comercial.fotos as string[]) ?? []

          return (
            <button
              key={alt.id}
              type="button"
              onClick={() => onChoose(alt.id)}
              className={cn(
                'flex-shrink-0 w-56 snap-start rounded-xl border overflow-hidden text-left transition-all',
                isChosen
                  ? 'border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50/30'
                  : 'border-slate-200 bg-white hover:border-indigo-300'
              )}
            >
              {fotos.length > 0 && (
                <img
                  src={fotos[0]}
                  alt={alt.titulo}
                  className="w-full aspect-[3/2] object-cover"
                  loading="lazy"
                />
              )}
              <div className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-slate-900 flex-1 truncate">
                    {alt.titulo}
                  </h4>
                  {isChosen && (
                    <Check className="h-4 w-4 text-indigo-600 shrink-0" />
                  )}
                </div>
                {alt.preco != null && alt.preco > 0 && (
                  <p className="text-sm font-medium text-indigo-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(alt.preco)}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
