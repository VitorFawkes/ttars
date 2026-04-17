import { useState, useEffect } from 'react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from '../../ui/drawer'
import { Input } from '../../ui/Input'
import { Label } from '../../ui/label'
import { Select } from '../../ui/Select'
import { Button } from '../../ui/Button'
import { Plus, AlertCircle, Clock } from 'lucide-react'
import type { Database } from '../../../database.types'
import UniversalFieldRenderer from '../../fields/UniversalFieldRenderer'
import { FIELD_TYPES } from '../../../constants/admin'
import { useGovernableSections } from '../../../hooks/useSections'
import { useProductContext } from '../../../hooks/useProductContext'
import SortableOptionsList from './SortableOptionsList'

type SystemField = Database['public']['Tables']['system_fields']['Row']

interface FieldOption {
    label: string
    value: string
    color?: string
}

interface FieldInspectorDrawerProps {
    isOpen: boolean
    onClose: () => void
    field: Partial<SystemField> | null
    onSave: (field: Partial<SystemField>) => void
    isCreating?: boolean
}

export default function FieldInspectorDrawer({ isOpen, onClose, field, onSave, isCreating = false }: FieldInspectorDrawerProps) {
    const [formData, setFormData] = useState<Partial<SystemField>>({})
    const [options, setOptions] = useState<FieldOption[]>([])
    const [newOptionLabel, setNewOptionLabel] = useState('')
    const [optionError, setOptionError] = useState<string | null>(null)

    const { currentProduct } = useProductContext()

    // Fetch governable sections filtered by current product (no TRIPS sections for WEDDING and vice-versa)
    const { data: governableSections = [] } = useGovernableSections(currentProduct)
    const sectionOptions = governableSections.map(s => ({ value: s.key, label: s.label }))

    useEffect(() => {
        if (field) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFormData(field)
            // Parse options if they exist
            if (field.options) {
                if (Array.isArray(field.options)) {
                    setOptions(field.options as unknown as FieldOption[])
                } else {
                    setOptions([])
                }
            } else {
                setOptions([])
            }
        }
    }, [field])

    const handleSave = () => {
        onSave({
            ...formData,
            options: (options.length > 0 ? options : null) as unknown as SystemField['options']
        })
        onClose()
    }

    const addOption = () => {
        if (!newOptionLabel.trim()) return

        const normalizedLabel = newOptionLabel.trim()
        const normalizedValue = normalizedLabel.toLowerCase().replace(/\s+/g, '_')

        // Check for duplicates
        if (options.some(opt => opt.value === normalizedValue || opt.label.toLowerCase() === normalizedLabel.toLowerCase())) {
            setOptionError('Esta opção já existe.')
            return
        }

        const newOption = {
            label: normalizedLabel,
            value: normalizedValue,
            color: 'gray'
        }
        setOptions([...options, newOption])
        setNewOptionLabel('')
        setOptionError(null)
    }

    const showOptionsManager = formData.type === 'select' || formData.type === 'multiselect' || formData.type === 'checklist'

    const [keyTouched, setKeyTouched] = useState(false)

    useEffect(() => {
        if (isCreating && !keyTouched && formData.label) {
            const generatedKey = formData.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFormData((prev: Partial<SystemField>) => ({ ...prev, key: generatedKey }))
        }
    }, [formData.label, isCreating, keyTouched])

    // Construct preview field object
    const previewField = {
        ...formData,
        options: options as unknown as SystemField['options']
    }

    return (
        <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DrawerContent className="sm:max-w-xl flex flex-col overflow-hidden h-[90vh]">
                <DrawerClose onClick={onClose} />
                <DrawerHeader>
                    <DrawerTitle>{isCreating ? 'Novo Campo' : 'Editar Campo'}</DrawerTitle>
                    <p className="text-sm text-muted-foreground">
                        {isCreating ? 'Defina as propriedades do novo campo.' : `Ajustando configurações de "${formData.label}"`}
                    </p>
                </DrawerHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <div className="space-y-8">

                        {/* LIVE PREVIEW SECTION */}
                        <div className="bg-muted/50 p-4 rounded-xl border border-border shadow-sm">
                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Live Preview (Como aparecerá no Card)
                            </h4>

                            {/* Generate appropriate preview value based on field type */}
                            {(() => {
                                // Compute preview value based on type
                                let previewValue: string | number | boolean | string[] | Record<string, unknown> = 'Valor de Exemplo'

                                switch (formData.type) {
                                    case 'multiselect':
                                        previewValue = options.length > 0
                                            ? options.slice(0, 2).map((o) => o.label || o.value)
                                            : ['Opção 1', 'Opção 2']
                                        break
                                    case 'checklist':
                                        // For checklist, show some items as checked
                                        previewValue = options.length > 0
                                            ? options.slice(0, 2).map((o) => o.value || o.label)
                                            : ['item_1', 'item_2']
                                        break
                                    case 'select':
                                        previewValue = options.length > 0
                                            ? (options[0].label || options[0].value)
                                            : 'Opção Selecionada'
                                        break
                                    case 'boolean':
                                        previewValue = true
                                        break
                                    case 'date':
                                        previewValue = '2025-06-15'
                                        break
                                    case 'date_range':
                                        previewValue = { start: '2025-06-15', end: '2025-06-20' }
                                        break
                                    case 'currency':
                                        previewValue = 5000
                                        break
                                    case 'currency_range':
                                        previewValue = { min: 5000, max: 15000 }
                                        break
                                    case 'number':
                                        previewValue = 42
                                        break
                                    case 'textarea':
                                        previewValue = 'Texto de exemplo com múltiplas linhas...'
                                        break
                                    case 'flexible_date':
                                        previewValue = {
                                            tipo: 'range_meses',
                                            mes_inicio: 8,
                                            mes_fim: 11,
                                            ano: 2025,
                                            display: 'Agosto a Novembro 2025',
                                            flexivel: true
                                        }
                                        break
                                    case 'flexible_duration':
                                        previewValue = {
                                            tipo: 'range',
                                            dias_min: 5,
                                            dias_max: 7,
                                            display: '5 a 7 dias'
                                        }
                                        break
                                    case 'smart_budget':
                                        previewValue = {
                                            tipo: 'por_pessoa',
                                            valor: 3000,
                                            quantidade_viajantes: 4,
                                            total_calculado: 12000,
                                            por_pessoa_calculado: 3000,
                                            display: 'R$ 3.000/pessoa (R$ 12.000 total)'
                                        }
                                        break
                                    default:
                                        previewValue = 'Valor de Exemplo'
                                }

                                // Different preview based on section
                                if (formData.section === 'observacoes_criticas') {
                                    // Important Info Layout: Label + Input (Edit Mode)
                                    return (
                                        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
                                            <label className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                                                {formData.label || 'Nome do Campo'}
                                            </label>
                                            <UniversalFieldRenderer
                                                field={previewField}
                                                value={formData.type === 'boolean' ? false : (formData.type === 'multiselect' ? [] : '')}
                                                mode="edit"
                                                onChange={() => { }}
                                            />
                                        </div>
                                    )
                                } else {
                                    // Trip Info Layout: Card Display Mode
                                    return (
                                        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
                                            <UniversalFieldRenderer
                                                field={previewField}
                                                value={previewValue}
                                                mode="display"
                                            />
                                        </div>
                                    )
                                }
                            })()}
                        </div>

                        {/* Identity Section */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Nome do Campo (Label)</Label>
                                    <Input
                                        value={formData.label || ''}
                                        onChange={e => setFormData({ ...formData, label: e.target.value })}
                                        placeholder="Ex: Motivo de Perda"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Chave (ID do Sistema)</Label>
                                    <Input
                                        value={formData.key || ''}
                                        onChange={e => {
                                            setFormData({ ...formData, key: e.target.value })
                                            setKeyTouched(true)
                                        }}
                                        disabled={!isCreating}
                                        placeholder="ex: motivo_perda"
                                        className="font-mono text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Tipo de Dado</Label>
                                    <Select
                                        value={formData.type || 'text'}
                                        onChange={val => setFormData({ ...formData, type: val })}
                                        options={FIELD_TYPES as unknown as { value: string; label: string }[]}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Seção</Label>
                                    <Select
                                        value={formData.section || sectionOptions[0]?.value || ''}
                                        onChange={val => setFormData({ ...formData, section: val })}
                                        options={sectionOptions}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Date Range Options (Include Time) */}
                        {formData.type === 'date_range' && (
                            <div className="border-t border-border pt-6">
                                <h4 className="font-medium text-foreground mb-4">Configurações do Período</h4>
                                <label className="flex items-center gap-3 p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={(formData.options as Record<string, unknown>)?.includeTime as boolean || false}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            options: { ...((formData.options as Record<string, unknown>) || {}), includeTime: e.target.checked }
                                        })}
                                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium text-foreground">Incluir horário</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground ml-auto">Permite selecionar hora além da data</span>
                                </label>
                            </div>
                        )}

                        {/* Options Manager */}
                        {showOptionsManager && (
                            <div className="border-t border-border pt-6">
                                <h4 className="font-medium text-foreground mb-4">Opções de Seleção</h4>

                                <div className="flex gap-2 mb-2">
                                    <Input
                                        value={newOptionLabel}
                                        onChange={e => {
                                            setNewOptionLabel(e.target.value)
                                            if (optionError) setOptionError(null)
                                        }}
                                        placeholder="Nova opção (ex: Preço Alto)"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault() // Prevent form submission if any
                                                addOption()
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button" // CRITICAL FIX: Prevent form submission
                                        onClick={addOption}
                                        size="sm"
                                        className="shrink-0"
                                    >
                                        <Plus className="w-4 h-4 mr-1" /> Adicionar
                                    </Button>
                                </div>
                                {optionError && (
                                    <p className="text-xs text-destructive flex items-center gap-1 mb-3">
                                        <AlertCircle className="h-3 w-3" /> {optionError}
                                    </p>
                                )}


                                <SortableOptionsList
                                    options={options}
                                    onChange={setOptions}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <DrawerFooter className="border-t border-border bg-card">
                    <Button onClick={handleSave} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                        {isCreating ? 'Criar Campo' : 'Salvar Alterações'}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}
