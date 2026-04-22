import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useOrg } from '../../contexts/OrgContext'
import { toast } from 'sonner'
import {
    Package,
    Plus,
    Pencil,
    Loader2,
    Check,
    X,
    Plane,
    Heart,
    Building2,
    HelpCircle,
    Briefcase,
    type LucideIcon,
} from 'lucide-react'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../../components/ui/dialog'

interface ProductRow {
    id: string
    slug: string
    name: string
    name_short: string
    icon_name: string
    color_class: string
    pipeline_id: string | null
    deal_label: string | null
    deal_plural: string | null
    main_date_label: string | null
    not_found_label: string | null
    active: boolean
    display_order: number
}

// Ícones disponíveis (ícones Lucide que fazem sentido para produtos/linhas de negócio)
const ICON_OPTIONS: Record<string, LucideIcon> = {
    Briefcase,
    Plane,
    Heart,
    Building2,
    Package,
    HelpCircle,
}

// Cores Tailwind (text-{color}-500) disponíveis
const COLOR_OPTIONS: { label: string; value: string; hex: string }[] = [
    { label: 'Indigo', value: 'text-indigo-500', hex: '#6366f1' },
    { label: 'Blue', value: 'text-blue-500', hex: '#3b82f6' },
    { label: 'Teal', value: 'text-teal-500', hex: '#14b8a6' },
    { label: 'Emerald', value: 'text-emerald-500', hex: '#10b981' },
    { label: 'Amber', value: 'text-amber-500', hex: '#f59e0b' },
    { label: 'Rose', value: 'text-rose-500', hex: '#f43f5e' },
    { label: 'Purple', value: 'text-purple-500', hex: '#a855f7' },
    { label: 'Slate', value: 'text-slate-500', hex: '#64748b' },
]

interface ProductFormState {
    name: string
    name_short: string
    icon_name: string
    color_class: string
    deal_label: string
    deal_plural: string
    main_date_label: string
    not_found_label: string
}

const emptyForm: ProductFormState = {
    name: '',
    name_short: '',
    icon_name: 'Briefcase',
    color_class: 'text-indigo-500',
    deal_label: 'Negócio',
    deal_plural: 'Negócios',
    main_date_label: 'Data Principal',
    not_found_label: 'Negócio não encontrado',
}

export default function ProductsManagement() {
    const queryClient = useQueryClient()
    const { org } = useOrg()
    const activeOrgId = org?.id

    const { data: products, isLoading } = useQuery<ProductRow[]>({
        queryKey: ['products', 'admin', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) return []
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('org_id', activeOrgId)
                .order('display_order')
            if (error) throw error
            return (data ?? []) as ProductRow[]
        },
        enabled: !!activeOrgId,
    })

    const [showModal, setShowModal] = useState(false)
    const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
    const [form, setForm] = useState<ProductFormState>(emptyForm)

    const openEdit = (product: ProductRow) => {
        setEditingProduct(product)
        setForm({
            name: product.name,
            name_short: product.name_short,
            icon_name: product.icon_name,
            color_class: product.color_class,
            deal_label: product.deal_label ?? 'Negócio',
            deal_plural: product.deal_plural ?? 'Negócios',
            main_date_label: product.main_date_label ?? 'Data Principal',
            not_found_label: product.not_found_label ?? 'Negócio não encontrado',
        })
        setShowModal(true)
    }

    const saveMutation = useMutation({
        mutationFn: async (data: ProductFormState) => {
            if (!editingProduct) throw new Error('Criação de produto novo exige alteração do enum app_product — peça para a equipe técnica.')
            const payload = {
                name: data.name.trim(),
                name_short: data.name_short.trim() || data.name.trim(),
                icon_name: data.icon_name,
                color_class: data.color_class,
                deal_label: data.deal_label.trim() || null,
                deal_plural: data.deal_plural.trim() || null,
                main_date_label: data.main_date_label.trim() || null,
                not_found_label: data.not_found_label.trim() || null,
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('products').update(payload).eq('id', editingProduct.id)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Produto atualizado!')
            queryClient.invalidateQueries({ queryKey: ['products'] })
            setShowModal(false)
        },
        onError: (err: Error) => toast.error(`Erro: ${err.message}`),
    })

    const toggleActiveMutation = useMutation({
        mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('products').update({ active }).eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
        },
        onError: (err: Error) => toast.error(`Erro: ${err.message}`),
    })

    const stats = useMemo(() => {
        if (!products) return []
        return [
            { label: 'Produtos', value: products.length, color: 'blue' as const },
            { label: 'Ativos', value: products.filter(p => p.active).length, color: 'green' as const },
        ]
    }, [products])

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <AdminPageHeader
                title="Produtos"
                subtitle="Linhas de negócio da sua organização. Cada produto possui seu próprio pipeline, campos e configurações."
                icon={<Package className="w-5 h-5" />}
                stats={stats}
                actions={
                    <Button
                        size="sm"
                        disabled
                        title="Criação de produto novo exige alteração do enum app_product — peça para a equipe técnica."
                    >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Novo Produto
                    </Button>
                }
            />

            {isLoading ? (
                <div className="py-20 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                </div>
            ) : !products || products.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-sm">
                    Nenhum produto cadastrado.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {products.map((product) => {
                        const Icon = ICON_OPTIONS[product.icon_name] ?? HelpCircle
                        return (
                            <div
                                key={product.id}
                                className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 transition-colors hover:border-slate-300"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg bg-slate-50 ${product.color_class}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-slate-900 text-sm">{product.name}</h3>
                                            <code className="text-xs text-slate-400 font-mono">{product.slug}</code>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => openEdit(product)}
                                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                                            title="Editar"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => toggleActiveMutation.mutate({ id: product.id, active: !product.active })}
                                            className={`p-1.5 rounded-md transition-colors ${
                                                product.active
                                                    ? 'text-green-600 hover:bg-green-50'
                                                    : 'text-slate-400 hover:bg-slate-50'
                                            }`}
                                            title={product.active ? 'Desativar' : 'Ativar'}
                                        >
                                            {product.active ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <dl className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <dt className="text-slate-400">Label do negócio</dt>
                                        <dd className="text-slate-700 font-medium">{product.deal_label ?? '—'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-400">Plural</dt>
                                        <dd className="text-slate-700 font-medium">{product.deal_plural ?? '—'}</dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-slate-400">Data principal</dt>
                                        <dd className="text-slate-700 font-medium">{product.main_date_label ?? '—'}</dd>
                                    </div>
                                </dl>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal de edição */}
            <Dialog open={showModal} onOpenChange={(open) => { if (!open) setShowModal(false) }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {editingProduct ? `Editar ${editingProduct.slug}` : 'Novo Produto'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Nome
                                </label>
                                <Input
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    placeholder="Welcome Trips"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Nome curto
                                </label>
                                <Input
                                    value={form.name_short}
                                    onChange={(e) => setForm((f) => ({ ...f, name_short: e.target.value }))}
                                    placeholder="Trips"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Ícone
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(ICON_OPTIONS).map(([name, Icon]) => (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={() => setForm((f) => ({ ...f, icon_name: name }))}
                                            className={`p-2 rounded-md border transition-colors ${
                                                form.icon_name === name
                                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                                                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Cor
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_OPTIONS.map((c) => (
                                        <button
                                            key={c.value}
                                            type="button"
                                            onClick={() => setForm((f) => ({ ...f, color_class: c.value }))}
                                            className={`w-7 h-7 rounded-full border-2 transition-transform ${
                                                form.color_class === c.value
                                                    ? 'border-slate-900 scale-110'
                                                    : 'border-white shadow-sm hover:scale-105'
                                            }`}
                                            style={{ backgroundColor: c.hex }}
                                            title={c.label}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Label do negócio
                                </label>
                                <Input
                                    value={form.deal_label}
                                    onChange={(e) => setForm((f) => ({ ...f, deal_label: e.target.value }))}
                                    placeholder="Viagem"
                                />
                                <p className="text-xs text-slate-400 mt-1">Como "viagem" em "Nova viagem"</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                    Plural
                                </label>
                                <Input
                                    value={form.deal_plural}
                                    onChange={(e) => setForm((f) => ({ ...f, deal_plural: e.target.value }))}
                                    placeholder="Viagens"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Data principal
                            </label>
                            <Input
                                value={form.main_date_label}
                                onChange={(e) => setForm((f) => ({ ...f, main_date_label: e.target.value }))}
                                placeholder="Data da Viagem"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Mensagem "não encontrado"
                            </label>
                            <Input
                                value={form.not_found_label}
                                onChange={(e) => setForm((f) => ({ ...f, not_found_label: e.target.value }))}
                                placeholder="Viagem não encontrada"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowModal(false)}
                            disabled={saveMutation.isPending}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => saveMutation.mutate(form)}
                            disabled={saveMutation.isPending || !form.name.trim()}
                        >
                            {saveMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                'Salvar'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
