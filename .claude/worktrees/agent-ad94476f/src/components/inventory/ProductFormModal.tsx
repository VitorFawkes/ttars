import { useState } from 'react'
import { X, Upload, Loader2, Trash2 } from 'lucide-react'
import { useInventoryProductMutations, type InventoryProduct } from '@/hooks/useInventoryProducts'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface ProductFormModalProps {
    product: InventoryProduct | null
    onClose: () => void
}

export default function ProductFormModal({ product, onClose }: ProductFormModalProps) {
    const isEditing = !!product
    const { createProduct, updateProduct, deleteProduct } = useInventoryProductMutations()

    const [form, setForm] = useState({
        name: product?.name ?? '',
        sku: product?.sku ?? '',
        description: product?.description ?? '',
        category: product?.category ?? 'geral',
        unit_price: product?.unit_price ?? 0,
        low_stock_threshold: product?.low_stock_threshold ?? 5,
        current_stock: 0,
    })
    const [imagePath, setImagePath] = useState(product?.image_path ?? '')
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const ext = file.name.split('.').pop()
            const path = `${crypto.randomUUID()}.${ext}`
            const { error } = await supabase.storage.from('inventory-images').upload(path, file)
            if (error) throw error
            setImagePath(path)
            toast.success('Imagem enviada')
        } catch {
            toast.error('Erro ao enviar imagem')
        } finally {
            setUploading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim() || !form.sku.trim()) {
            toast.error('Nome e SKU são obrigatórios')
            return
        }

        setSaving(true)
        try {
            if (isEditing) {
                const { current_stock: _, ...editFields } = form // eslint-disable-line @typescript-eslint/no-unused-vars
                await updateProduct.mutateAsync({
                    id: product.id,
                    ...editFields,
                    image_path: imagePath || null,
                })
                toast.success('Produto atualizado')
            } else {
                const { current_stock, ...rest } = form
                await createProduct.mutateAsync({
                    ...rest,
                    current_stock: current_stock > 0 ? current_stock : undefined,
                    image_path: imagePath || undefined,
                })
                toast.success('Produto criado')
            }
            onClose()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao salvar'
            toast.error(msg)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!product) return
        if (!confirm('Desativar este produto? Ele não aparecerá mais no catálogo.')) return

        try {
            await deleteProduct.mutateAsync(product.id)
            toast.success('Produto desativado')
            onClose()
        } catch {
            toast.error('Erro ao desativar produto')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">
                        {isEditing ? 'Editar Produto' : 'Novo Produto'}
                    </h2>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1">SKU *</label>
                            <input
                                type="text"
                                value={form.sku}
                                onChange={e => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                            <input
                                type="text"
                                value={form.category}
                                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Preço (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.unit_price}
                                onChange={e => setForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Alerta Mín.</label>
                            <input
                                type="number"
                                min="0"
                                value={form.low_stock_threshold}
                                onChange={e => setForm(f => ({ ...f, low_stock_threshold: parseInt(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    {!isEditing && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Estoque Inicial</label>
                            <input
                                type="number"
                                min="0"
                                value={form.current_stock}
                                onChange={e => setForm(f => ({ ...f, current_stock: parseInt(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-xs text-slate-400 mt-1">Quantidade disponível ao criar o produto</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Imagem</label>
                        <div className="flex items-center gap-3">
                            {imagePath ? (
                                <img
                                    src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/inventory-images/${imagePath}`}
                                    alt="Preview"
                                    className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                                />
                            ) : (
                                <div className="h-16 w-16 rounded-lg bg-slate-100 flex items-center justify-center">
                                    <Upload className="h-5 w-5 text-slate-400" />
                                </div>
                            )}
                            <div className="flex flex-col gap-1">
                                <label className="cursor-pointer text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                                    {uploading ? 'Enviando...' : imagePath ? 'Alterar imagem' : 'Enviar imagem'}
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                                </label>
                                {imagePath && (
                                    <button
                                        type="button"
                                        onClick={() => setImagePath('')}
                                        className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600 font-medium"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Remover imagem
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                        {isEditing ? (
                            <button type="button" onClick={handleDelete} className="text-sm text-red-600 hover:text-red-700 font-medium">
                                Desativar Produto
                            </button>
                        ) : (
                            <div />
                        )}
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                {isEditing ? 'Salvar' : 'Criar Produto'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
