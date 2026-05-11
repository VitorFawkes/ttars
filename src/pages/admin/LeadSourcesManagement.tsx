import { useState } from 'react'
import {
    Tag,
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Loader2,
    AlertTriangle,
    Pencil,
    Check,
    XCircle,
    Lock,
} from 'lucide-react'
import { createElement } from 'react'
import { ORIGEM_ICON_MAP, getOrigemIcon } from '@/lib/origem-icons'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
    useLeadSourcesAll,
    useCreateLeadSource,
    useUpdateLeadSource,
    useDeleteLeadSource,
    type LeadSource,
} from '@/hooks/useLeadSources'

const ICON_OPTIONS = Object.keys(ORIGEM_ICON_MAP)

const COLOR_OPTIONS = [
    { name: 'Cinza', value: 'bg-gray-100 text-gray-700 border-gray-200' },
    { name: 'Slate', value: 'bg-slate-100 text-slate-700 border-slate-200' },
    { name: 'Vermelho', value: 'bg-red-100 text-red-700 border-red-200' },
    { name: 'Laranja', value: 'bg-orange-100 text-orange-700 border-orange-200' },
    { name: 'Âmbar', value: 'bg-amber-100 text-amber-700 border-amber-200' },
    { name: 'Verde', value: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { name: 'Ciano', value: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
    { name: 'Azul', value: 'bg-blue-100 text-blue-700 border-blue-200' },
    { name: 'Violeta', value: 'bg-violet-100 text-violet-700 border-violet-200' },
    { name: 'Rosa', value: 'bg-pink-100 text-pink-700 border-pink-200' },
    { name: 'Rosa Forte', value: 'bg-rose-100 text-rose-700 border-rose-200' },
    { name: 'Verde Claro', value: 'bg-green-100 text-green-700 border-green-200' },
]

function renderIcon(name: string, className?: string) {
    const Icon = getOrigemIcon(name)
    return createElement(Icon, { className: className || 'w-4 h-4' })
}

export default function LeadSourcesManagement() {
    const { profile } = useAuth()
    const isAdmin = profile?.is_admin === true

    const { data: sources, isLoading } = useLeadSourcesAll()
    const createMutation = useCreateLeadSource()
    const updateMutation = useUpdateLeadSource()
    const deleteMutation = useDeleteLeadSource()

    const [newLabel, setNewLabel] = useState('')
    const [newIcon, setNewIcon] = useState('Tag')
    const [newColor, setNewColor] = useState(COLOR_OPTIONS[7].value)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editLabel, setEditLabel] = useState('')
    const [editIcon, setEditIcon] = useState('Tag')
    const [editColor, setEditColor] = useState('')

    if (!isAdmin) {
        return (
            <div className="p-8 max-w-2xl mx-auto">
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="p-6 flex items-start gap-3">
                        <Lock className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                            <p className="font-medium text-amber-900">Acesso restrito</p>
                            <p className="text-sm text-amber-800 mt-1">Só administradores podem gerenciar as fontes de lead.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        )
    }

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault()
        if (!newLabel.trim()) return
        const value = newLabel.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')
        createMutation.mutate(
            { value, label: newLabel.trim(), icon: newIcon, color: newColor },
            {
                onSuccess: () => {
                    setNewLabel('')
                    setNewIcon('Tag')
                    setNewColor(COLOR_OPTIONS[7].value)
                },
            }
        )
    }

    const startEditing = (source: LeadSource) => {
        setEditingId(source.id)
        setEditLabel(source.label)
        setEditIcon(source.icon)
        setEditColor(source.color)
    }

    const cancelEditing = () => {
        setEditingId(null)
        setEditLabel('')
    }

    const saveEditing = () => {
        if (!editingId || !editLabel.trim()) return
        updateMutation.mutate(
            { id: editingId, label: editLabel.trim(), icon: editIcon, color: editColor },
            { onSuccess: () => cancelEditing() }
        )
    }

    const manualSources = (sources || []).filter(s => !s.is_integration)
    const integrationSources = (sources || []).filter(s => s.is_integration)

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">
            <AdminPageHeader
                title="Fontes de Lead"
                subtitle="Gerencie as opções de origem disponíveis ao criar ou editar cards e contatos."
                icon={<Tag className="w-6 h-6 text-indigo-500" />}
                actions={null}
                stats={[
                    { label: 'Total ativas', value: manualSources.filter(s => s.ativa).length, color: 'green' as const },
                    { label: 'Personalizadas', value: manualSources.filter(s => !s.is_system).length, color: 'purple' as const },
                ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* Add new */}
                    <Card className="border-slate-200 shadow-sm bg-white">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Plus className="w-5 h-5 text-slate-500" />
                                Adicionar nova fonte
                            </CardTitle>
                            <CardDescription>Aparecerá ao criar/editar cards. Cor e ícone deixam ela visualmente distinta.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAdd} className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium text-slate-600 mb-1 block">Nome</label>
                                    <Input
                                        placeholder="Ex: Indicação de Fornecedor"
                                        value={newLabel}
                                        onChange={(e) => setNewLabel(e.target.value)}
                                        className="bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-600 mb-2 block">Cor</label>
                                    <div className="flex flex-wrap gap-2">
                                        {COLOR_OPTIONS.map(c => (
                                            <button
                                                key={c.value}
                                                type="button"
                                                onClick={() => setNewColor(c.value)}
                                                className={cn(
                                                    'px-3 py-1 rounded-full text-xs border-2 transition-all',
                                                    c.value,
                                                    newColor === c.value ? 'ring-2 ring-offset-1 ring-indigo-500 border-current' : 'border-transparent'
                                                )}
                                            >
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-600 mb-2 block">Ícone</label>
                                    <div className="flex flex-wrap gap-2">
                                        {ICON_OPTIONS.map(name => (
                                            <button
                                                key={name}
                                                type="button"
                                                onClick={() => setNewIcon(name)}
                                                className={cn(
                                                    'p-2 rounded-lg border transition-all',
                                                    newIcon === name
                                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                                )}
                                                title={name}
                                            >
                                                {renderIcon(name, 'w-4 h-4')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border', newColor)}>
                                        {renderIcon(newIcon, 'w-3.5 h-3.5')}
                                        <span>{newLabel.trim() || 'Pré-visualização'}</span>
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={!newLabel.trim() || createMutation.isPending}
                                        className="bg-slate-900 hover:bg-slate-800 text-white"
                                    >
                                        {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                        Adicionar
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Manual sources list */}
                    <Card className="border-slate-200 shadow-sm bg-white">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Tag className="w-5 h-5 text-slate-500" />
                                Fontes selecionáveis manualmente
                            </CardTitle>
                            <CardDescription>Aparecem no dropdown de origem. Padrões do sistema podem ser ocultados, mas não removidos.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {manualSources.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                        Nenhuma fonte cadastrada.
                                    </div>
                                ) : (
                                    manualSources.map(source => (
                                        <div
                                            key={source.id}
                                            className={cn(
                                                'group flex items-center justify-between p-3 rounded-lg border transition-all',
                                                source.ativa ? 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'
                                            )}
                                        >
                                            {editingId === source.id ? (
                                                <div className="flex-1 space-y-3">
                                                    <Input
                                                        value={editLabel}
                                                        onChange={(e) => setEditLabel(e.target.value)}
                                                        className="h-8 text-sm bg-white"
                                                        autoFocus
                                                    />
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {COLOR_OPTIONS.map(c => (
                                                            <button
                                                                key={c.value}
                                                                type="button"
                                                                onClick={() => setEditColor(c.value)}
                                                                className={cn(
                                                                    'px-2.5 py-0.5 rounded-full text-[10px] border-2',
                                                                    c.value,
                                                                    editColor === c.value ? 'ring-2 ring-offset-1 ring-indigo-500 border-current' : 'border-transparent'
                                                                )}
                                                            >
                                                                {c.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {ICON_OPTIONS.map(name => (
                                                            <button
                                                                key={name}
                                                                type="button"
                                                                onClick={() => setEditIcon(name)}
                                                                className={cn(
                                                                    'p-1.5 rounded-md border',
                                                                    editIcon === name
                                                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                                                        : 'bg-white border-slate-200 text-slate-500'
                                                                )}
                                                            >
                                                                {renderIcon(name, 'w-3.5 h-3.5')}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-center gap-2 justify-end pt-2 border-t border-slate-100">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={cancelEditing}
                                                            className="text-slate-500"
                                                        >
                                                            <XCircle className="w-4 h-4 mr-1" /> Cancelar
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={saveEditing}
                                                            disabled={!editLabel.trim() || updateMutation.isPending}
                                                            className="bg-slate-900 text-white hover:bg-slate-800"
                                                        >
                                                            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                                                            Salvar
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border', source.color)}>
                                                            {renderIcon(source.icon, 'w-3 h-3')}
                                                            <span className="font-medium">{source.label}</span>
                                                        </div>
                                                        {source.is_system && (
                                                            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200 font-normal">Padrão</Badge>
                                                        )}
                                                        {!source.ativa && (
                                                            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200 font-normal">Oculta</Badge>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => startEditing(source)}
                                                            title="Editar"
                                                            className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => updateMutation.mutate({ id: source.id, ativa: !source.ativa })}
                                                            title={source.ativa ? 'Ocultar do dropdown' : 'Mostrar no dropdown'}
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-700"
                                                        >
                                                            {source.ativa ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                        </Button>
                                                        {!source.is_system && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => {
                                                                    if (confirm(`Excluir a fonte "${source.label}"? Cards já criados com essa fonte vão manter o valor, mas ela some do dropdown.`)) {
                                                                        deleteMutation.mutate(source.id)
                                                                    }
                                                                }}
                                                                title="Excluir"
                                                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Integration sources */}
                    {integrationSources.length > 0 && (
                        <Card className="border-slate-200 shadow-sm bg-white">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2 text-slate-700">
                                    <Lock className="w-5 h-5 text-slate-400" />
                                    Fontes automáticas
                                </CardTitle>
                                <CardDescription>Preenchidas pelo sistema quando o lead chega por integração. Não editáveis.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2">
                                    {integrationSources.map(source => (
                                        <div
                                            key={source.id}
                                            className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border', source.color)}
                                        >
                                            {renderIcon(source.icon, 'w-3 h-3')}
                                            <span className="font-medium">{source.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Sidebar info */}
                <div className="space-y-6">
                    <Card className="bg-indigo-50/50 border-indigo-100 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base text-indigo-900 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Como funciona
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-indigo-800 space-y-3">
                            <p><strong>Padrão</strong> são as 6 fontes que vêm com o sistema. Você pode ocultá-las (botão olho), mas não excluí-las.</p>
                            <p><strong>Automáticas</strong> são preenchidas quando o lead chega por integração (site, WhatsApp, Active Campaign). Não dá pra editar pra não quebrar a entrada de leads.</p>
                            <p>Fontes que você cria aqui aparecem em todos os lugares: criação de card, cabeçalho do card, cadastro de contato, filtros.</p>
                            <p className="pt-2 border-t border-indigo-100 text-indigo-700">Esta lista é específica deste workspace.</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
