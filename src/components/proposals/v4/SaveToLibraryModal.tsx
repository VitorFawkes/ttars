/**
 * SaveToLibraryModal - Modal para salvar item na biblioteca
 *
 * Permite que a consultora salve um item criado na proposta
 * diretamente na biblioteca para reutilização futura.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import {
  X,
  BookmarkPlus,
  Loader2,
  Check,
  Building2,
  Sparkles,
  Car,
  Shield,
  Ship,
} from 'lucide-react'
import { toast } from 'sonner'
import { useSaveToLibrary, type LibraryCategory } from '@/hooks/useLibrary'
import type { ProposalItemWithOptions } from '@/types/proposals'

// Extended category type that includes cruise and insurance for internal use
// (insurance is used internally but maps to 'service' in the library)
type ExtendedCategory = LibraryCategory | 'cruise' | 'insurance'

interface SaveToLibraryModalProps {
  isOpen: boolean
  onClose: () => void
  item: ProposalItemWithOptions
  category: ExtendedCategory
}

// Map item_type to library category
const CATEGORY_CONFIG: Record<string, {
  icon: typeof Building2
  color: string
  bgColor: string
}> = {
  hotel: { icon: Building2, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  experience: { icon: Sparkles, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  transfer: { icon: Car, color: 'text-teal-600', bgColor: 'bg-teal-100' },
  service: { icon: Shield, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  insurance: { icon: Shield, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  cruise: { icon: Ship, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
}

const CATEGORY_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  experience: 'Experiência',
  transfer: 'Transfer',
  service: 'Seguro',
  insurance: 'Seguro',
  cruise: 'Cruzeiro',
}

export function SaveToLibraryModal({
  isOpen,
  onClose,
  item,
  category,
}: SaveToLibraryModalProps) {
  const [name, setName] = useState(item.title || '')
  const [destination, setDestination] = useState('')
  const saveToLibrary = useSaveToLibrary()

  if (!isOpen) return null

  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.hotel
  const Icon = config.icon
  const categoryLabel = CATEGORY_LABELS[category] || category

  // Extract content based on category
  const getContentForLibrary = (): Record<string, unknown> => {
    const richContent = (item.rich_content as Record<string, unknown>) || {}

    // Return the namespaced content directly
    switch (category) {
      case 'hotel':
        return richContent.hotel ? { hotel: richContent.hotel } : {}
      case 'experience':
        return richContent.experience ? { experience: richContent.experience } : {}
      case 'transfer':
        return richContent.transfer ? { transfer: richContent.transfer } : {}
      case 'service':
      case 'insurance':
        return richContent.insurance ? { insurance: richContent.insurance } : {}
      case 'cruise':
        return richContent.cruise ? { cruise: richContent.cruise } : {}
      default:
        return richContent
    }
  }

  // Extract destination from content
  const getDestinationHint = (): string => {
    const richContent = (item.rich_content as Record<string, unknown>) || {}

    if (category === 'hotel') {
      const hotel = richContent.hotel as Record<string, unknown> | undefined
      return (hotel?.location_city as string) || ''
    }
    if (category === 'experience') {
      const experience = richContent.experience as Record<string, unknown> | undefined
      return (experience?.location as string) || ''
    }
    if (category === 'transfer') {
      const transfer = richContent.transfer as Record<string, unknown> | undefined
      const origin = (transfer?.origin as string) || ''
      const dest = (transfer?.destination as string) || ''
      if (origin && dest) return `${origin} → ${dest}`
      return origin || dest || ''
    }

    return ''
  }

  // Get base price from content
  const getBasePrice = (): number => {
    const richContent = (item.rich_content as Record<string, unknown>) || {}

    if (category === 'hotel') {
      const hotel = richContent.hotel as Record<string, unknown> | undefined
      const pricePerNight = Number(hotel?.price_per_night) || 0
      const nights = Number(hotel?.nights) || 1
      return pricePerNight * nights
    }
    if (category === 'experience') {
      const experience = richContent.experience as Record<string, unknown> | undefined
      return Number(experience?.price) || Number(item.base_price) || 0
    }
    if (category === 'transfer') {
      const transfer = richContent.transfer as Record<string, unknown> | undefined
      return Number(transfer?.price) || Number(item.base_price) || 0
    }
    if (category === 'service' || category === 'insurance') {
      const insurance = richContent.insurance as Record<string, unknown> | undefined
      return Number(insurance?.price) || Number(item.base_price) || 0
    }

    return Number(item.base_price) || 0
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Digite um nome para o item')
      return
    }

    // Map extended categories to valid library categories
    const getLibraryCategory = (): LibraryCategory => {
      if (category === 'insurance') return 'service'
      if (category === 'cruise') return 'custom'
      return category as LibraryCategory
    }

    try {
      await saveToLibrary.mutateAsync({
        name: name.trim(),
        category: getLibraryCategory(),
        content: getContentForLibrary(),
        basePrice: getBasePrice(),
        destination: destination.trim() || getDestinationHint() || undefined,
        isShared: true,
      })

      toast.success('Item salvo na biblioteca!')
      onClose()
    } catch (error) {
      console.error('Error saving to library:', error)
      toast.error('Erro ao salvar na biblioteca')
    }
  }

  const destinationHint = getDestinationHint()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', config.bgColor)}>
              <BookmarkPlus className={cn('h-5 w-5', config.color)} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Salvar na Biblioteca</h3>
              <p className="text-xs text-slate-500">Reutilize este item em outras propostas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Category Badge */}
          <div className="flex items-center gap-2">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.bgColor)}>
              <Icon className={cn('h-4 w-4', config.color)} />
            </div>
            <span className="text-sm font-medium text-slate-700">{categoryLabel}</span>
          </div>

          {/* Name Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome do item na biblioteca
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Grand Hyatt São Paulo"
              className="w-full"
              autoFocus
            />
          </div>

          {/* Destination Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Destino (opcional)
            </label>
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={destinationHint || 'Ex: São Paulo, Maldivas...'}
              className="w-full"
            />
            {destinationHint && !destination && (
              <p className="text-xs text-slate-400 mt-1">
                Sugestão: {destinationHint}
              </p>
            )}
          </div>

          {/* Info */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700">
              O item será salvo com todas as informações atuais (imagens, preços, descrições).
              Você poderá editá-lo depois na seção Biblioteca.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saveToLibrary.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveToLibrary.isPending || !name.trim()}
            className="min-w-[120px]"
          >
            {saveToLibrary.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Salvar
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SaveToLibraryModal
