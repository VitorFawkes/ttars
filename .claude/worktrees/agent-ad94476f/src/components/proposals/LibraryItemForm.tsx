/**
 * LibraryItemForm - Formulário completo para itens da biblioteca
 *
 * Campos específicos por categoria:
 * - Hotel: estrelas, amenities, check-in/out, regime
 * - Experiência: duração, incluídos, dificuldade, ponto de encontro
 * - Transfer: origem/destino, veículo, capacidade
 * - Seguro: cobertura médica, coberturas, fornecedor
 */

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useCreateLibraryItem,
  useUpdateLibraryItem,
  type LibraryItem
} from '@/hooks/useLibrary'
import type { Json } from '@/database.types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { Loader2, Building2, Sparkles, Car, Shield, Plus, X, Star, Info } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { LibraryImageUploader } from './LibraryImageUploader'

// ============================================
// Schema base
// ============================================
const baseSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  category: z.enum(['hotel', 'experience', 'transfer', 'service', 'text_block', 'custom'] as const),
  description: z.string().optional(),
  base_price: z.number().min(0).optional(),
  destination: z.string().optional(),
  supplier: z.string().optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),  // Galeria de imagens
})

// Categorias válidas para o formulário (excluindo 'flight' que é muito volátil)
type FormCategory = 'hotel' | 'experience' | 'transfer' | 'service' | 'text_block' | 'custom'

// ============================================
// Categorias disponíveis na UI (SEM VOO - muito volátil)
// ============================================
const AVAILABLE_CATEGORIES: { value: FormCategory; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'hotel', label: 'Hotel', icon: <Building2 className="h-4 w-4" />, description: 'Hotéis, pousadas, resorts' },
  { value: 'experience', label: 'Experiência', icon: <Sparkles className="h-4 w-4" />, description: 'Passeios, tours, atividades' },
  { value: 'transfer', label: 'Transfer', icon: <Car className="h-4 w-4" />, description: 'Traslados, transporte' },
  { value: 'service', label: 'Seguro', icon: <Shield className="h-4 w-4" />, description: 'Seguros viagem' },
]

type FormData = z.infer<typeof baseSchema> & {
  // Imagens
  images?: string[]
  // Hotel
  star_rating?: number
  room_type?: string
  board_type?: string
  amenities?: string[]
  check_in_time?: string
  check_out_time?: string
  cancellation_policy?: string
  // Experience
  duration?: string
  included?: string[]
  meeting_point?: string
  difficulty_level?: 'easy' | 'moderate' | 'challenging'
  age_restriction?: string
  // Transfer
  origin?: string
  origin_type?: 'airport' | 'hotel' | 'port' | 'address'
  destination_transfer?: string
  destination_type?: 'airport' | 'hotel' | 'port' | 'address'
  vehicle_type?: string
  max_passengers?: number
  // Insurance
  provider?: string
  medical_coverage?: number
  coverage_currency?: string
  coverages?: string[]
}

interface LibraryItemFormProps {
  isOpen: boolean
  onClose: () => void
  item?: LibraryItem
}

// ============================================
// Componente de lista editável (amenities, included, etc)
// ============================================
function EditableList({
  value = [],
  onChange,
  placeholder,
  label,
}: {
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  label: string
}) {
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    if (newItem.trim()) {
      onChange([...value, newItem.trim()])
      setNewItem('')
    }
  }

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
        />
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {value.map((item, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 text-sm rounded-md"
            >
              {item}
              <button type="button" onClick={() => removeItem(idx)} className="hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// Componente de estrelas
// ============================================
function StarRating({
  value = 0,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">Classificação</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={cn(
              "p-1 rounded transition-colors",
              star <= value ? "text-amber-400" : "text-slate-300 hover:text-amber-200"
            )}
          >
            <Star className="h-6 w-6 fill-current" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================
// Formulário Principal
// ============================================
export function LibraryItemForm({ isOpen, onClose, item }: LibraryItemFormProps) {
  const createItem = useCreateLibraryItem()
  const updateItem = useUpdateLibraryItem()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'hotel',
      base_price: 0,
      destination: '',
      supplier: '',
      tags: [],
      images: [],
      amenities: [],
      included: [],
      coverages: [],
    }
  })

  const selectedCategory = watch('category')

  // Carregar dados do item existente
  useEffect(() => {
    if (isOpen) {
      if (item) {
        const content = item.content as Record<string, unknown> || {}
        const formValues: FormData = {
          name: item.name,
          description: content.description as string || '',
          category: item.category as FormCategory,
          base_price: item.base_price || 0,
          destination: item.destination || '',
          supplier: item.supplier || '',
          tags: item.tags || [],
          images: content.images as string[] || [],
          // Hotel
          star_rating: content.star_rating as number | undefined,
          room_type: content.room_type as string | undefined,
          board_type: content.board_type as string | undefined,
          amenities: content.amenities as string[] || [],
          check_in_time: content.check_in_time as string || '14:00',
          check_out_time: content.check_out_time as string || '12:00',
          cancellation_policy: content.cancellation_policy as string | undefined,
          // Experience
          duration: content.duration as string | undefined,
          included: content.included as string[] || [],
          meeting_point: content.meeting_point as string | undefined,
          difficulty_level: content.difficulty_level as 'easy' | 'moderate' | 'challenging' | undefined,
          age_restriction: content.age_restriction as string | undefined,
          // Transfer
          origin: content.origin as string | undefined,
          origin_type: content.origin_type as 'airport' | 'hotel' | 'port' | 'address' | undefined,
          destination_transfer: content.destination_transfer as string | undefined,
          destination_type: content.destination_type as 'airport' | 'hotel' | 'port' | 'address' | undefined,
          vehicle_type: content.vehicle_type as string | undefined,
          max_passengers: content.max_passengers as number | undefined,
          // Insurance
          provider: content.provider as string || item.supplier || undefined,
          medical_coverage: content.medical_coverage as number | undefined,
          coverage_currency: content.coverage_currency as string || 'USD',
          coverages: content.coverages as string[] || [],
        }
        reset(formValues)
      } else {
        reset({
          name: '',
          description: '',
          category: 'hotel',
          base_price: 0,
          destination: '',
          supplier: '',
          tags: [],
          images: [],
          amenities: [],
          included: [],
          coverages: [],
          check_in_time: '14:00',
          check_out_time: '12:00',
          coverage_currency: 'USD',
        })
      }
    }
  }, [isOpen, item, reset])

  // Watch images for the uploader
  const currentImages = watch('images') || []

  const onSubmit = async (data: FormData) => {
    try {
      // Monta o content baseado na categoria
      const content: Record<string, unknown> = {
        description: data.description,
        images: data.images || [],  // Sempre inclui imagens
      }

      if (data.category === 'hotel') {
        content.star_rating = data.star_rating
        content.room_type = data.room_type
        content.board_type = data.board_type
        content.amenities = data.amenities
        content.check_in_time = data.check_in_time
        content.check_out_time = data.check_out_time
        content.cancellation_policy = data.cancellation_policy
      } else if (data.category === 'experience') {
        content.duration = data.duration
        content.included = data.included
        content.meeting_point = data.meeting_point
        content.difficulty_level = data.difficulty_level
        content.age_restriction = data.age_restriction
      } else if (data.category === 'transfer') {
        content.origin = data.origin
        content.origin_type = data.origin_type
        content.destination_transfer = data.destination_transfer
        content.destination_type = data.destination_type
        content.vehicle_type = data.vehicle_type
        content.max_passengers = data.max_passengers
      } else if (data.category === 'service') {
        content.provider = data.provider
        content.medical_coverage = data.medical_coverage
        content.coverage_currency = data.coverage_currency
        content.coverages = data.coverages
      }

      if (item) {
        await updateItem.mutateAsync({
          id: item.id,
          updates: {
            name: data.name,
            category: data.category,
            base_price: data.base_price,
            destination: data.destination || null,
            supplier: data.supplier || null,
            tags: data.tags || [],
            content: content as Json,
          },
        })
        toast.success('Item atualizado com sucesso')
      } else {
        await createItem.mutateAsync({
          name: data.name,
          category: data.category,
          base_price: data.base_price,
          destination: data.destination || null,
          supplier: data.supplier || null,
          tags: data.tags || [],
          content: content as Json,
        })
        toast.success('Item criado com sucesso')
      }
      onClose()
    } catch (error) {
      console.error('Error saving item:', error)
      toast.error('Erro ao salvar item')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Editar Item da Biblioteca' : 'Novo Item da Biblioteca'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 py-4">
          {/* Seleção de Categoria */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">Tipo de Item</label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setValue('category', cat.value)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all",
                    selectedCategory === cat.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-lg",
                    selectedCategory === cat.value ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                  )}>
                    {cat.icon}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{cat.label}</p>
                    <p className="text-xs text-slate-500">{cat.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              Itens da biblioteca ficam salvos para reutilização. Preencha os detalhes para facilitar a criação de propostas.
            </p>
          </div>

          {/* Campos Comuns */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Nome *</label>
              <Input
                {...register('name')}
                placeholder={
                  selectedCategory === 'hotel' ? 'Ex: Hotel Fasano Rio de Janeiro' :
                  selectedCategory === 'experience' ? 'Ex: Tour Privado pelo Vaticano' :
                  selectedCategory === 'transfer' ? 'Ex: Transfer Aeroporto → Hotel' :
                  'Ex: Seguro Assist Card 60'
                }
                className={cn(errors.name && "border-red-500")}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Destino</label>
                <Input
                  {...register('destination')}
                  placeholder="Ex: Rio de Janeiro"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Fornecedor</label>
                <Input
                  {...register('supplier')}
                  placeholder="Ex: Fasano Hotels"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Descrição</label>
              <Textarea
                {...register('description')}
                placeholder="Descrição detalhada do item para apresentação ao cliente..."
                className="h-20 resize-none"
              />
            </div>

            {/* Upload de Imagens */}
            <LibraryImageUploader
              images={currentImages}
              onImagesChange={(urls) => setValue('images', urls)}
              maxImages={5}
            />
          </div>

          {/* ============================================ */}
          {/* CAMPOS ESPECÍFICOS: HOTEL */}
          {/* ============================================ */}
          {selectedCategory === 'hotel' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-slate-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                Detalhes do Hotel
              </h3>

              <Controller
                name="star_rating"
                control={control}
                render={({ field }) => (
                  <StarRating value={field.value || 0} onChange={field.onChange} />
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Tipo de Quarto</label>
                  <Input {...register('room_type')} placeholder="Ex: Suite Master" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Regime</label>
                  <Controller
                    name="board_type"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || ''}
                        onChange={field.onChange}
                        options={[
                          { value: 'room_only', label: 'Somente hospedagem' },
                          { value: 'breakfast', label: 'Café da manhã' },
                          { value: 'half_board', label: 'Meia pensão' },
                          { value: 'full_board', label: 'Pensão completa' },
                          { value: 'all_inclusive', label: 'All inclusive' },
                        ]}
                        placeholder="Selecione o regime"
                      />
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Check-in</label>
                  <Input type="time" {...register('check_in_time')} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Check-out</label>
                  <Input type="time" {...register('check_out_time')} />
                </div>
              </div>

              <Controller
                name="amenities"
                control={control}
                render={({ field }) => (
                  <EditableList
                    value={field.value || []}
                    onChange={field.onChange}
                    label="Amenidades"
                    placeholder="Ex: Piscina, Spa, Academia..."
                  />
                )}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Política de Cancelamento</label>
                <Textarea
                  {...register('cancellation_policy')}
                  placeholder="Ex: Cancelamento gratuito até 7 dias antes da chegada"
                  className="h-16 resize-none"
                />
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* CAMPOS ESPECÍFICOS: EXPERIÊNCIA */}
          {/* ============================================ */}
          {selectedCategory === 'experience' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-slate-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                Detalhes da Experiência
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Duração</label>
                  <Input {...register('duration')} placeholder="Ex: 4 horas" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Nível de Dificuldade</label>
                  <Controller
                    name="difficulty_level"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || ''}
                        onChange={field.onChange}
                        options={[
                          { value: 'easy', label: 'Fácil' },
                          { value: 'moderate', label: 'Moderado' },
                          { value: 'challenging', label: 'Desafiador' },
                        ]}
                        placeholder="Selecione"
                      />
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Ponto de Encontro</label>
                <Input {...register('meeting_point')} placeholder="Ex: Porta da Basílica de São Pedro" />
              </div>

              <Controller
                name="included"
                control={control}
                render={({ field }) => (
                  <EditableList
                    value={field.value || []}
                    onChange={field.onChange}
                    label="O que está incluído"
                    placeholder="Ex: Guia em português, Ingressos..."
                  />
                )}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Restrição de Idade</label>
                <Input {...register('age_restriction')} placeholder="Ex: Maiores de 12 anos" />
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* CAMPOS ESPECÍFICOS: TRANSFER */}
          {/* ============================================ */}
          {selectedCategory === 'transfer' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-slate-900 flex items-center gap-2">
                <Car className="h-4 w-4 text-green-600" />
                Detalhes do Transfer
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Origem</label>
                  <Input {...register('origin')} placeholder="Ex: Aeroporto GRU" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Tipo de Origem</label>
                  <Controller
                    name="origin_type"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || ''}
                        onChange={field.onChange}
                        options={[
                          { value: 'airport', label: 'Aeroporto' },
                          { value: 'hotel', label: 'Hotel' },
                          { value: 'port', label: 'Porto' },
                          { value: 'address', label: 'Endereço' },
                        ]}
                        placeholder="Selecione"
                      />
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Destino</label>
                  <Input {...register('destination_transfer')} placeholder="Ex: Hotel Fasano" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Tipo de Destino</label>
                  <Controller
                    name="destination_type"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || ''}
                        onChange={field.onChange}
                        options={[
                          { value: 'airport', label: 'Aeroporto' },
                          { value: 'hotel', label: 'Hotel' },
                          { value: 'port', label: 'Porto' },
                          { value: 'address', label: 'Endereço' },
                        ]}
                        placeholder="Selecione"
                      />
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Tipo de Veículo</label>
                  <Controller
                    name="vehicle_type"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || ''}
                        onChange={field.onChange}
                        options={[
                          { value: 'sedan', label: 'Sedan Executivo' },
                          { value: 'suv', label: 'SUV' },
                          { value: 'van', label: 'Van' },
                          { value: 'minibus', label: 'Minibus' },
                          { value: 'luxury', label: 'Luxo' },
                        ]}
                        placeholder="Selecione"
                      />
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Capacidade</label>
                  <Input
                    type="number"
                    {...register('max_passengers', { valueAsNumber: true })}
                    placeholder="Ex: 4"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* CAMPOS ESPECÍFICOS: SEGURO */}
          {/* ============================================ */}
          {selectedCategory === 'service' && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-medium text-slate-900 flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-600" />
                Detalhes do Seguro
              </h3>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Fornecedor do Seguro</label>
                <Controller
                  name="provider"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={[
                        { value: 'assist_card', label: 'Assist Card' },
                        { value: 'travel_ace', label: 'Travel Ace' },
                        { value: 'affinity', label: 'Affinity' },
                        { value: 'allianz', label: 'Allianz' },
                        { value: 'gta', label: 'GTA' },
                        { value: 'other', label: 'Outro' },
                      ]}
                      placeholder="Selecione o fornecedor"
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Cobertura Médica</label>
                  <Input
                    type="number"
                    {...register('medical_coverage', { valueAsNumber: true })}
                    placeholder="Ex: 60000"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Moeda</label>
                  <Controller
                    name="coverage_currency"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value || 'USD'}
                        onChange={field.onChange}
                        options={[
                          { value: 'USD', label: 'USD' },
                          { value: 'EUR', label: 'EUR' },
                          { value: 'BRL', label: 'BRL' },
                        ]}
                        placeholder="Moeda"
                      />
                    )}
                  />
                </div>
              </div>

              <Controller
                name="coverages"
                control={control}
                render={({ field }) => (
                  <EditableList
                    value={field.value || []}
                    onChange={field.onChange}
                    label="Coberturas Incluídas"
                    placeholder="Ex: Despesas médicas, Extravio de bagagem..."
                  />
                )}
              />
            </div>
          )}

          {/* Preço */}
          <div className="border-t pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Preço Base (R$)
                <span className="text-xs text-slate-400 ml-2">
                  {selectedCategory === 'hotel' ? 'por noite' : 'total'}
                </span>
              </label>
              <Input
                type="number"
                step="0.01"
                {...register('base_price', { valueAsNumber: true })}
                placeholder="0,00"
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {item ? 'Salvar Alterações' : 'Criar Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
