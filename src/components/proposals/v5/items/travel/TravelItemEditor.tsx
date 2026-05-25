/**
 * TravelItemEditor — Wrapper that reuses V4 type-specific editors
 *
 * Routes to FlightEditor, HotelEditor, ExperienceEditor, TransferEditor,
 * CruiseEditor, InsuranceEditor based on item_type / rich_content.
 * Falls back to a generic editable card for unknown types.
 */

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
    ChevronDown,
    Plane, Building2, Star, Car, Ship, Shield, Package,
    BookmarkPlus,
    Wallet,
} from 'lucide-react'
import { FlightEditor, type FlightsData } from '@/components/proposals/v4/flights'
import { HotelEditor, type HotelData } from '@/components/proposals/v4/hotels'
import { ExperienceEditor, type ExperienceData } from '@/components/proposals/v4/experiences'
import { TransferEditor, type TransferData } from '@/components/proposals/v4/transfers'
import { CruiseEditor, type CruiseData } from '@/components/proposals/v4/cruises'
import { InsuranceEditor, type InsuranceData } from '@/components/proposals/v4/insurance'
import { SaveToLibraryModal } from '@/components/proposals/v4/SaveToLibraryModal'
import type { ProposalItemWithOptions } from '@/types/proposals'
import type { Json } from '@/database.types'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    flight: { icon: Plane, color: 'bg-sky-100 text-sky-600', label: 'Voo' },
    hotel: { icon: Building2, color: 'bg-blue-100 text-blue-600', label: 'Hotel' },
    experience: { icon: Star, color: 'bg-orange-100 text-orange-600', label: 'Experiencia' },
    transfer: { icon: Car, color: 'bg-teal-100 text-teal-600', label: 'Transfer' },
    cruise: { icon: Ship, color: 'bg-indigo-100 text-indigo-600', label: 'Cruzeiro' },
    insurance: { icon: Shield, color: 'bg-rose-100 text-rose-600', label: 'Seguro' },
    custom: { icon: Package, color: 'bg-amber-100 text-amber-600', label: 'Item' },
}

interface TravelItemEditorProps {
    item: ProposalItemWithOptions
    sectionType: string
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
    itemIndex?: number
    itemsTotal?: number
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TravelItemEditor({ item, sectionType: _sectionType, onUpdate, itemIndex, itemsTotal }: TravelItemEditorProps) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [showSaveLibrary, setShowSaveLibrary] = useState(false)
    const [showSupplierDetail, setShowSupplierDetail] = useState(false)
    const showBadge = itemsTotal !== undefined && itemsTotal > 1 && itemIndex !== undefined
    const richContent = (item.rich_content as Record<string, unknown>) || {}

    // Detect effective type
    const effectiveType = richContent.cruise ? 'cruise'
        : richContent.insurance || item.item_type === 'insurance' ? 'insurance'
        : item.item_type || 'custom'

    const config = TYPE_CONFIG[effectiveType] || TYPE_CONFIG.custom
    const Icon = config.icon

    const handleRichContentChange = useCallback((key: string, data: unknown) => {
        onUpdate({ rich_content: { ...richContent, [key]: data } as unknown as Json })
    }, [richContent, onUpdate])

    // Supplier cost bar
    const supplierCost = item.supplier_cost || 0
    const basePrice = item.base_price || 0
    const margin = basePrice > 0 && supplierCost > 0 ? basePrice - supplierCost : 0

    return (
        <div className="overflow-hidden rounded-xl">
            {/* Compact header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/60 border-b border-slate-200/80">
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', config.color)}>
                    <Icon className="h-3.5 w-3.5" />
                </div>
                {showBadge && (
                    <span className="text-[11px] font-semibold text-slate-500 tabular-nums px-1.5 py-0.5 bg-white rounded border border-slate-200 flex-shrink-0">
                        {(itemIndex as number) + 1}/{itemsTotal}
                    </span>
                )}
                <input
                    type="text"
                    value={item.title || ''}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    className="flex-1 text-sm font-medium text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                    placeholder={`Titulo do ${config.label.toLowerCase()}`}
                />
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSaveLibrary(true)}
                    className="h-7 w-7 text-slate-400 hover:text-indigo-600"
                    title="Salvar na Biblioteca"
                >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="h-7 w-7"
                >
                    <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', !isExpanded && '-rotate-90')} />
                </Button>
            </div>

            {/* Editor body */}
            {isExpanded && (
                <div className="p-4">
                    {effectiveType === 'flight' && (
                        <FlightEditor
                            data={(richContent.flights as FlightsData) || null}
                            onChange={(flights) => handleRichContentChange('flights', flights)}
                        />
                    )}
                    {effectiveType === 'hotel' && (
                        <HotelEditor
                            data={(richContent.hotel as HotelData) || null}
                            onChange={(hotel) => handleRichContentChange('hotel', hotel)}
                            itemId={item.id}
                        />
                    )}
                    {effectiveType === 'experience' && (
                        <ExperienceEditor
                            data={(richContent.experience as ExperienceData) || null}
                            onChange={(experience) => handleRichContentChange('experience', experience)}
                            itemId={item.id}
                        />
                    )}
                    {effectiveType === 'transfer' && (
                        <TransferEditor
                            data={(richContent.transfer as TransferData) || null}
                            onChange={(transfer) => handleRichContentChange('transfer', transfer)}
                            itemId={item.id}
                        />
                    )}
                    {effectiveType === 'cruise' && (
                        <CruiseEditor
                            data={(richContent.cruise as CruiseData) || null}
                            onChange={(cruise) => handleRichContentChange('cruise', cruise)}
                            itemId={item.id}
                        />
                    )}
                    {effectiveType === 'insurance' && (
                        <InsuranceEditor
                            data={(richContent.insurance as InsuranceData) || null}
                            onChange={(insurance) => handleRichContentChange('insurance', insurance)}
                            itemId={item.id}
                        />
                    )}
                    {effectiveType === 'custom' && (
                        <div className="space-y-3">
                            <Input
                                value={item.description || ''}
                                onChange={(e) => onUpdate({ description: e.target.value })}
                                placeholder="Descricao do item"
                                className="text-sm"
                            />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Preco:</span>
                                <span className="text-xs text-slate-400">R$</span>
                                <Input
                                    type="number"
                                    value={item.base_price || ''}
                                    onChange={(e) => onUpdate({ base_price: parseFloat(e.target.value) || 0 })}
                                    className="w-32 text-sm text-right"
                                    step="0.01"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Supplier cost bar — compact by default, click to expand */}
            {isExpanded && !showSupplierDetail && (
                <button
                    type="button"
                    onClick={() => setShowSupplierDetail(true)}
                    className="w-full flex items-center gap-2 px-4 py-2 border-t border-slate-100 bg-slate-50/60 hover:bg-slate-100/60 transition-colors text-left"
                >
                    <Wallet className="h-3 w-3 text-slate-400 flex-shrink-0" />
                    <span className="text-[11px] text-slate-500">
                        {supplierCost > 0 ? (
                            <>
                                Custo interno: <span className="font-medium text-slate-700">R$ {supplierCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                {margin > 0 && (
                                    <> · margem <span className="font-medium text-emerald-700">R$ {margin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></>
                                )}
                            </>
                        ) : (
                            <span className="text-slate-400">Adicionar custo interno (nao aparece para cliente)</span>
                        )}
                    </span>
                    <ChevronDown className="h-3 w-3 text-slate-400 ml-auto -rotate-90" />
                </button>
            )}
            {isExpanded && showSupplierDetail && (
                <div className="flex items-center gap-3 px-4 py-2 border-t border-amber-100 bg-amber-50/50">
                    <span className="text-xs font-medium text-amber-700">Custo Fornecedor:</span>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-amber-600">R$</span>
                        <input
                            type="number"
                            value={supplierCost || ''}
                            onChange={(e) => onUpdate({ supplier_cost: parseFloat(e.target.value) || 0 })}
                            className="w-24 text-sm font-semibold text-amber-800 bg-white border border-amber-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-amber-400 text-right"
                            placeholder="0,00"
                            step="0.01"
                            autoFocus
                        />
                    </div>
                    {margin > 0 && (
                        <span className="text-xs text-amber-600">
                            Receita: R$ {margin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowSupplierDetail(false)}
                        className="h-6 w-6 ml-auto"
                        title="Recolher"
                    >
                        <ChevronDown className="h-3 w-3 text-amber-600 rotate-90" />
                    </Button>
                </div>
            )}

            {/* Save to Library modal */}
            {showSaveLibrary && (
                <SaveToLibraryModal
                    isOpen={showSaveLibrary}
                    onClose={() => setShowSaveLibrary(false)}
                    item={item}
                    category={effectiveType as 'hotel' | 'experience' | 'transfer' | 'flight' | 'cruise' | 'insurance' | 'service' | 'text_block' | 'custom'}
                />
            )}
        </div>
    )
}
