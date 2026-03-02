import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Tag, Plus, Pencil, Trash2, Loader2, Check } from 'lucide-react'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { useCardTags, useCardTagUsageCounts, type CardTag } from '../../hooks/useCardTags'

// Paleta de 12 cores fixas
const COLOR_PALETTE = [
    '#6366f1', // Indigo
    '#3b82f6', // Blue
    '#06b6d4', // Cyan
    '#14b8a6', // Teal
    '#22c55e', // Green
    '#eab308', // Yellow
    '#f97316', // Orange
    '#ef4444', // Red
    '#ec4899', // Pink
    '#a855f7', // Purple
    '#64748b', // Slate
    '#71717a', // Zinc
]

const PRODUTO_OPTIONS = [
    { value: '', label: 'Todos os produtos' },
    { value: 'TRIPS', label: 'Trips' },
    { value: 'WEDDING', label: 'Wedding' },
    { value: 'CORP', label: 'Corp' },
]

interface TagFormState {
    name: string
    color: string
    description: string
    produto: string
}

const emptyForm: TagFormState = { name: '', color: '#6366f1', description: '', produto: '' }

export default function TagManagement() {
    const queryClient = useQueryClient()
    const { tags, isLoading } = useCardTags()
    const { data: usageCounts = {} } = useCardTagUsageCounts()

    const [showModal, setShowModal] = useState(false)
    const [editingTag, setEditingTag] = useState<CardTag | null>(null)
    const [form, setForm] = useState<TagFormState>(emptyForm)

    const openCreate = () => {
        setEditingTag(null)
        setForm(emptyForm)
        setShowModal(true)
    }

    const openEdit = (tag: CardTag) => {
        setEditingTag(tag)
        setForm({ name: tag.name, color: tag.color, description: tag.description ?? '', produto: tag.produto ?? '' })
        setShowModal(true)
    }

    const saveMutation = useMutation({
        mutationFn: async (data: TagFormState) => {
            const payload = {
                name: data.name.trim(),
                color: data.color,
                description: data.description.trim() || null,
                produto: data.produto || null,
            }
            if (editingTag) {
                const { error } = await (supabase as any).from('card_tags').update(payload).eq('id', editingTag.id)
                if (error) throw error
            } else {
                const { error } = await (supabase as any).from('card_tags').insert(payload)
                if (error) throw error
            }
        },
        onSuccess: () => {
            toast.success(editingTag ? 'Tag atualizada!' : 'Tag criada!')
            queryClient.invalidateQueries({ queryKey: ['card-tags'] })
            setShowModal(false)
        },
        onError: (err: Error) => {
            toast.error(`Erro: ${err.message}`)
        },
    })

    const toggleActiveMutation = useMutation({
        mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
            const { error } = await (supabase as any).from('card_tags').update({ is_active }).eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-tags'] })
        },
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase as any).from('card_tags').delete().eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Tag excluída!')
            queryClient.invalidateQueries({ queryKey: ['card-tags'] })
            queryClient.invalidateQueries({ queryKey: ['card-tag-usage-counts'] })
        },
        onError: (err: Error) => {
            toast.error(`Erro ao excluir: ${err.message}`)
        },
    })

    const handleDelete = (tag: CardTag) => {
        const count = usageCounts[tag.id] ?? 0
        if (count > 0) {
            toast.error(`Não é possível excluir: a tag está em uso em ${count} card(s). Desative-a em vez disso.`)
            return
        }
        deleteMutation.mutate(tag.id)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        )
    }

    return (
        <div className="p-8 max-w-[1200px] mx-auto space-y-8">
            <AdminPageHeader
                title="Tags de Cards"
                subtitle="Crie e gerencie as tags disponíveis para marcar cards com informações importantes."
                icon={<Tag className="w-6 h-6 text-indigo-400" />}
                actions={
                    <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Nova Tag
                    </button>
                }
                stats={[
                    { label: 'Tags ativas', value: tags.length },
                    { label: 'Em uso', value: tags.filter(t => (usageCounts[t.id] ?? 0) > 0).length },
                ]}
            />

            {/* Tags Grid */}
            {tags.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                    <Tag className="w-10 h-10" />
                    <p className="text-base font-medium">Nenhuma tag criada ainda</p>
                    <p className="text-sm">Crie a primeira tag para começar a categorizar seus cards.</p>
                    <button
                        onClick={openCreate}
                        className="mt-2 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Criar primeira tag
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tags.map(tag => {
                        const count = usageCounts[tag.id] ?? 0
                        return (
                            <div
                                key={tag.id}
                                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3"
                            >
                                {/* Tag header */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span
                                            className="w-3 h-3 rounded-full shrink-0"
                                            style={{ backgroundColor: tag.color }}
                                        />
                                        <span
                                            className="text-sm font-semibold truncate"
                                            style={{ color: tag.color }}
                                        >
                                            {tag.name}
                                        </span>
                                        {tag.produto && (
                                            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                                {tag.produto}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => openEdit(tag)}
                                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                            title="Editar"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(tag)}
                                            disabled={count > 0}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                            title={count > 0 ? `Em uso em ${count} cards` : 'Excluir'}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {tag.description && (
                                    <p className="text-xs text-slate-500 leading-relaxed">{tag.description}</p>
                                )}

                                {/* Footer */}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <span className="text-xs text-slate-400">
                                        {count > 0 ? `${count} card${count > 1 ? 's' : ''}` : 'Sem uso'}
                                    </span>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <span className="text-xs text-slate-500">Ativa</span>
                                        <div
                                            onClick={() => toggleActiveMutation.mutate({ id: tag.id, is_active: !tag.is_active })}
                                            className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${tag.is_active ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                        >
                                            <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${tag.is_active ? 'translate-x-4.5 ml-0.5' : 'ml-0.5'}`} />
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modal Criar/Editar */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-base font-semibold text-slate-900 mb-4">
                            {editingTag ? 'Editar Tag' : 'Nova Tag'}
                        </h2>

                        <div className="space-y-4">
                            {/* Nome */}
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Nome *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="ex: VIP, Urgente, Documentação Pendente"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>

                            {/* Cor */}
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-2">Cor</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_PALETTE.map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setForm(f => ({ ...f, color }))}
                                            className="w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
                                            style={{ backgroundColor: color }}
                                        >
                                            {form.color === color && (
                                                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                {/* Preview */}
                                <div className="mt-2">
                                    <span
                                        className="inline-flex items-center gap-1 rounded-full text-xs px-2 py-1 font-medium border"
                                        style={{
                                            backgroundColor: form.color + '18',
                                            color: form.color,
                                            borderColor: form.color + '30',
                                        }}
                                    >
                                        {form.name || 'Preview'}
                                    </span>
                                </div>
                            </div>

                            {/* Produto */}
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Produto</label>
                                <select
                                    value={form.produto}
                                    onChange={e => setForm(f => ({ ...f, produto: e.target.value }))}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {PRODUTO_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Descrição */}
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Descrição (opcional)</label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="O que essa tag indica?"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="flex-1 border border-slate-300 text-slate-700 text-sm font-medium py-2 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={!form.name.trim() || saveMutation.isPending}
                                onClick={() => saveMutation.mutate(form)}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editingTag ? 'Salvar' : 'Criar Tag'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
