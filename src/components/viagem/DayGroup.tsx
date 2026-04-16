import { MapPin } from 'lucide-react'
import type { DayGroupData, TripComment } from '@/types/viagem'
import { ItemCard } from './ItemCard'

interface DayGroupProps {
  group: DayGroupData
  comments: TripComment[]
  onApprove?: (itemId: string) => void
  onChooseAlternative?: (itemId: string, altId: string) => void
  onComment?: (itemId: string, texto: string) => void
  approvingItemId?: string | null
  isCommenting?: boolean
  readOnly?: boolean
}

export function DayGroup({
  group,
  comments,
  onApprove,
  onChooseAlternative,
  onComment,
  approvingItemId,
  isCommenting,
  readOnly,
}: DayGroupProps) {
  const dayComercial = group.day.comercial as Record<string, string | undefined>
  const titulo = dayComercial.titulo ?? `Dia ${group.day.ordem + 1}`
  const descricao = dayComercial.descricao

  return (
    <div className="space-y-3">
      {/* Day header */}
      <div className="flex items-center gap-2 pt-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white">
          <MapPin className="h-3.5 w-3.5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">
            {titulo}
          </h2>
          {descricao && (
            <p className="text-xs text-slate-500">{descricao}</p>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3 pl-3 border-l-2 border-indigo-100 ml-3.5">
        {group.children.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            comments={comments}
            onApprove={onApprove}
            onChooseAlternative={onChooseAlternative}
            onComment={onComment}
            isApproving={approvingItemId === item.id}
            isCommenting={isCommenting}
            readOnly={readOnly}
          />
        ))}

        {group.children.length === 0 && (
          <p className="text-sm text-slate-400 italic py-2">
            Ainda sem itens neste dia
          </p>
        )}
      </div>
    </div>
  )
}
