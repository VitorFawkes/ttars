/**
 * TransferEditor - Editor dedicado para transfers
 *
 * Layout direto com seções condicionais
 * Campos podem ser habilitados/desabilitados conforme necessário
 */

import { useCallback, useMemo } from 'react'
import { Plus, ArrowRight, Calendar, Clock, Users, Plane, Building2, Ship, MapPin, Car, FileText, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { ItemImageUploader } from '@/components/proposals/builder/ItemImageUploader'
import { PriceField, InlinePriceField } from '../shared/PriceField'
import { SortableOptionsContainer } from '../shared/SortableOptionsContainer'
import { SortableOptionItem } from '../shared/SortableOptionItem'
import {
    type TransferData,
    type TransferOption,
    type LocationType,
    type VehicleType,
    LOCATION_TYPE_LABELS,
    VEHICLE_TYPE_LABELS,
    createInitialTransferData,
} from './types'

interface TransferEditorProps {
    data: TransferData | null
    onChange: (data: TransferData) => void
    itemId: string
}

const LOCATION_ICONS: Record<LocationType, React.ElementType> = {
    airport: Plane,
    hotel: Building2,
    port: Ship,
    address: MapPin,
}

export function TransferEditor({ data, onChange, itemId }: TransferEditorProps) {
    const transferData = useMemo(() => {
        const defaults = createInitialTransferData()
        // Merge with defaults to handle legacy/incomplete data
        return {
            ...defaults,
            ...data,
            // Ensure arrays are always defined
            options: data?.options || [],
            // Ensure required type fields have valid defaults
            origin_type: data?.origin_type || 'airport',
            destination_type: data?.destination_type || 'hotel',
            vehicle_type: data?.vehicle_type || 'sedan',
        }
    }, [data])

    const updateField = useCallback(<K extends keyof TransferData>(
        field: K,
        value: TransferData[K]
    ) => {
        onChange({ ...transferData, [field]: value })
    }, [transferData, onChange])

    // Option handlers
    const addOption = useCallback(() => {
        const newOption: TransferOption = {
            id: crypto.randomUUID(),
            vehicle: 'sedan' as VehicleType,
            label: 'Nova opção',
            price: 0,
            is_recommended: false,
            enabled: true,
            ordem: transferData.options.length,
        }
        onChange({
            ...transferData,
            options: [...transferData.options, newOption],
        })
    }, [transferData, onChange])

    const updateOption = useCallback((id: string, updates: Partial<TransferOption>) => {
        onChange({
            ...transferData,
            options: transferData.options.map(opt =>
                opt.id === id ? { ...opt, ...updates } : opt
            ),
        })
    }, [transferData, onChange])

    const removeOption = useCallback((id: string) => {
        onChange({
            ...transferData,
            options: transferData.options.filter(opt => opt.id !== id),
        })
    }, [transferData, onChange])

    const setRecommended = useCallback((id: string) => {
        onChange({
            ...transferData,
            options: transferData.options.map(opt => ({
                ...opt,
                is_recommended: opt.id === id,
            })),
        })
    }, [transferData, onChange])

    const toggleOptionEnabled = useCallback((id: string) => {
        onChange({
            ...transferData,
            options: transferData.options.map(opt =>
                opt.id === id ? { ...opt, enabled: !opt.enabled } : opt
            ),
        })
    }, [transferData, onChange])

    const reorderOptions = useCallback((reorderedOptions: TransferOption[]) => {
        onChange({
            ...transferData,
            options: reorderedOptions,
        })
    }, [transferData, onChange])

    // Configuração de campos visíveis
    const showRoute = transferData.show_route !== false
    const showDatetime = transferData.show_datetime !== false
    const showVehicle = transferData.show_vehicle !== false
    const showPassengers = transferData.show_passengers !== false

    const OriginIcon = LOCATION_ICONS[transferData.origin_type]
    const DestIcon = LOCATION_ICONS[transferData.destination_type]

    return (
        <div className="space-y-4">
            {/* Toggles de Campos - Barra de configuração */}
            <div className="flex items-center gap-2 flex-wrap p-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs font-medium text-slate-500 mr-2">Mostrar:</span>
                <FieldToggle
                    label="Rota"
                    enabled={showRoute}
                    onToggle={(v) => updateField('show_route', v)}
                />
                <FieldToggle
                    label="Data/Hora"
                    enabled={showDatetime}
                    onToggle={(v) => updateField('show_datetime', v)}
                />
                <FieldToggle
                    label="Veículo"
                    enabled={showVehicle}
                    onToggle={(v) => updateField('show_vehicle', v)}
                />
                <FieldToggle
                    label="Passageiros"
                    enabled={showPassengers}
                    onToggle={(v) => updateField('show_passengers', v)}
                />
            </div>

            {/* Imagem do Transfer */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-2 block">
                    Imagem do Transfer
                </label>
                <ItemImageUploader
                    imageUrl={transferData.image_url || null}
                    onImageChange={(url) => updateField('image_url', url)}
                    itemId={itemId}
                />
            </div>

            {/* Origin -> Destination Row (condicional) */}
            {showRoute && (
                <div className="p-3 bg-teal-50/50 rounded-lg border border-teal-100">
                    <div className="flex items-start gap-3">
                        {/* Origin */}
                        <div className="flex-1">
                            <label className="text-xs font-medium text-teal-700 mb-1 block">De</label>
                            <div className="flex gap-2">
                                <select
                                    value={transferData.origin_type}
                                    onChange={(e) => updateField('origin_type', e.target.value as LocationType)}
                                    className="w-auto px-2 py-2 text-sm border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                                >
                                    {Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={transferData.origin}
                                    onChange={(e) => updateField('origin', e.target.value)}
                                    placeholder="Nome do local"
                                    className="flex-1 px-3 py-2 text-sm border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                />
                            </div>
                        </div>

                        {/* Arrow */}
                        <div className="flex items-center justify-center pt-6">
                            <ArrowRight className="h-5 w-5 text-teal-400" />
                        </div>

                        {/* Destination */}
                        <div className="flex-1">
                            <label className="text-xs font-medium text-teal-700 mb-1 block">Para</label>
                            <div className="flex gap-2">
                                <select
                                    value={transferData.destination_type}
                                    onChange={(e) => updateField('destination_type', e.target.value as LocationType)}
                                    className="w-auto px-2 py-2 text-sm border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                                >
                                    {Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={transferData.destination}
                                    onChange={(e) => updateField('destination', e.target.value)}
                                    placeholder="Nome do local"
                                    className="flex-1 px-3 py-2 text-sm border border-teal-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Visual Route Summary */}
                    {(transferData.origin || transferData.destination) && (
                        <div className="flex items-center justify-center gap-3 mt-3 py-2 px-4 bg-white rounded-lg border border-teal-200">
                            <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                <OriginIcon className="h-4 w-4 text-teal-600" />
                                <span>{transferData.origin || '...'}</span>
                            </div>
                            <ArrowRight className="h-4 w-4 text-slate-400" />
                            <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                <DestIcon className="h-4 w-4 text-teal-600" />
                                <span>{transferData.destination || '...'}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Date, Time, Passengers Row (condicionais) */}
            <div className="grid grid-cols-3 gap-3">
                {showDatetime && (
                    <>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Data
                            </label>
                            <input
                                type="date"
                                value={transferData.date}
                                onChange={(e) => updateField('date', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Horário
                            </label>
                            <input
                                type="time"
                                value={transferData.time}
                                onChange={(e) => updateField('time', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                        </div>
                    </>
                )}
                {showPassengers && (
                    <div className={cn(!showDatetime && "col-span-3")}>
                        <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            Passageiros
                        </label>
                        <input
                            type="number"
                            value={transferData.passengers}
                            onChange={(e) => updateField('passengers', parseInt(e.target.value) || 1)}
                            min={1}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        />
                    </div>
                )}
            </div>

            {/* Vehicle (condicional) */}
            {showVehicle && (
                <div>
                    <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                        <Car className="h-3 w-3" />
                        Veículo
                    </label>
                    <select
                        value={transferData.vehicle_type}
                        onChange={(e) => updateField('vehicle_type', e.target.value as VehicleType)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                    >
                        {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Preço - Sempre visível, usando componente padronizado */}
            <PriceField
                price={transferData.price}
                onChange={(price) => updateField('price', price)}
                accentColor="teal"
            />

            {/* Descrição */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Descrição (opcional)
                </label>
                <textarea
                    value={transferData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Detalhes adicionais sobre o transfer, veículo, motorista..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
            </div>

            {/* Notas Internas */}
            <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                    Observações Internas (não aparece para cliente)
                </label>
                <input
                    type="text"
                    value={transferData.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="ex: Voo G3 1100, chega às 14h30"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-amber-50"
                />
            </div>

            {/* Options (Vehicle Upgrades) */}
            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-600">Opções de Veículo</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={addOption}
                        className="h-7 text-xs"
                    >
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar
                    </Button>
                </div>

                {transferData.options.length > 0 && (
                    <SortableOptionsContainer
                        items={transferData.options}
                        onReorder={reorderOptions}
                    >
                        <div className="space-y-2">
                            {transferData.options
                                .sort((a, b) => a.ordem - b.ordem)
                                .map((option) => (
                                    <SortableOptionItem
                                        key={option.id}
                                        id={option.id}
                                        isRecommended={option.is_recommended}
                                        enabled={option.enabled ?? true}
                                        onSetRecommended={() => setRecommended(option.id)}
                                        onToggleEnabled={() => toggleOptionEnabled(option.id)}
                                        onRemove={() => removeOption(option.id)}
                                        accentColor="teal"
                                    >
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={option.vehicle}
                                                onChange={(e) => updateOption(option.id, { vehicle: e.target.value as VehicleType })}
                                                className={cn(
                                                    "text-sm bg-transparent border-none outline-none cursor-pointer",
                                                    !option.enabled && "text-slate-400"
                                                )}
                                            >
                                                {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                                                    <option key={value} value={value}>{label}</option>
                                                ))}
                                            </select>

                                            <input
                                                type="text"
                                                value={option.label}
                                                onChange={(e) => updateOption(option.id, { label: e.target.value })}
                                                placeholder="Descrição"
                                                className={cn(
                                                    "flex-1 text-sm bg-transparent border-none outline-none",
                                                    !option.enabled && "text-slate-400"
                                                )}
                                            />

                                            <InlinePriceField
                                                price={option.price}
                                                onChange={(price) => updateOption(option.id, { price })}
                                                disabled={!option.enabled}
                                            />
                                        </div>
                                    </SortableOptionItem>
                                ))}
                        </div>
                    </SortableOptionsContainer>
                )}

                {transferData.options.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">
                        Nenhuma opção de veículo adicionada
                    </p>
                )}
            </div>
        </div>
    )
}

/**
 * FieldToggle - Mini toggle para habilitar/desabilitar campo
 */
function FieldToggle({
    label,
    enabled,
    onToggle,
}: {
    label: string
    enabled: boolean
    onToggle: (enabled: boolean) => void
}) {
    return (
        <button
            type="button"
            onClick={() => onToggle(!enabled)}
            className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                enabled
                    ? "bg-teal-100 text-teal-700 border border-teal-200"
                    : "bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200"
            )}
        >
            {enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {label}
        </button>
    )
}

export default TransferEditor
