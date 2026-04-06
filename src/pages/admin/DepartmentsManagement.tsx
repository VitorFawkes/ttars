import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { Briefcase, Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react'
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { useDepartments, type Department } from '../../hooks/useDepartments'
import { useAuth } from '../../contexts/AuthContext'

interface DepartmentFormState {
    name: string
    slug: string
    description: string
}

const emptyForm: DepartmentFormState = { name: '', slug: '', description: '' }

function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
}

export default function DepartmentsManagement() {
    const { profile } = useAuth()
    const { departments, isLoading, createDepartment, updateDepartment, deleteDepartment, isMutating } = useDepartments()

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingDept, setEditingDept] = useState<Department | null>(null)
    const [form, setForm] = useState<DepartmentFormState>(emptyForm)
    const [slugEdited, setSlugEdited] = useState(false)
    const [deleteCandidate, setDeleteCandidate] = useState<Department | null>(null)

    // Contagem de times por department
    const { data: teamCounts } = useQuery<Record<string, number>>({
        queryKey: ['department-team-counts'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('teams')
                .select('department_id')
            if (error) throw error
            const counts: Record<string, number> = {}
            for (const t of data ?? []) {
                const dept = (t as { department_id: string | null }).department_id
                if (dept) counts[dept] = (counts[dept] ?? 0) + 1
            }
            return counts
        },
    })

    const isAdmin = profile?.is_admin === true

    const openCreate = () => {
        setEditingDept(null)
        setForm(emptyForm)
        setSlugEdited(false)
        setIsModalOpen(true)
    }

    const openEdit = (dept: Department) => {
        setEditingDept(dept)
        setForm({
            name: dept.name,
            slug: dept.slug,
            description: dept.description ?? '',
        })
        setSlugEdited(true) // não sobrescrever slug ao editar
        setIsModalOpen(true)
    }

    const handleNameChange = (value: string) => {
        setForm((f) => ({
            ...f,
            name: value,
            slug: slugEdited ? f.slug : slugify(value),
        }))
    }

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            toast.error('Nome obrigatório')
            return
        }
        try {
            if (editingDept) {
                await updateDepartment({
                    id: editingDept.id,
                    name: form.name,
                    slug: form.slug,
                    description: form.description,
                })
                toast.success('Departamento atualizado!')
            } else {
                await createDepartment(form)
                toast.success('Departamento criado!')
            }
            setIsModalOpen(false)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erro ao salvar'
            toast.error(`Erro: ${message}`)
        }
    }

    const handleDelete = async () => {
        if (!deleteCandidate) return
        try {
            await deleteDepartment(deleteCandidate.id)
            toast.success('Departamento removido')
            setDeleteCandidate(null)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erro ao deletar'
            toast.error(`Erro: ${message}`)
        }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <AdminPageHeader
                title="Departamentos"
                subtitle="Organize seus times em departamentos para facilitar a gestão"
                icon={<Briefcase className="w-5 h-5" />}
                stats={[
                    { label: 'Departamentos', value: departments.length, color: 'blue' },
                ]}
                actions={
                    isAdmin ? (
                        <Button size="sm" onClick={openCreate}>
                            <Plus className="w-4 h-4 mr-1.5" />
                            Novo departamento
                        </Button>
                    ) : undefined
                }
            />

            {isLoading ? (
                <div className="py-20 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                </div>
            ) : departments.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
                    <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-semibold text-sm text-slate-900 mb-1">Nenhum departamento ainda</h3>
                    <p className="text-xs text-slate-500 mb-4">
                        Departamentos ajudam a organizar times por área (ex: Vendas, Pós-Venda, Marketing).
                    </p>
                    {isAdmin && (
                        <Button size="sm" onClick={openCreate}>
                            <Plus className="w-4 h-4 mr-1.5" />
                            Criar primeiro departamento
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {departments.map((dept) => (
                        <div
                            key={dept.id}
                            className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 hover:border-slate-300 transition-colors"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                        <Briefcase className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900 text-sm">{dept.name}</h3>
                                        <code className="text-xs text-slate-400 font-mono">{dept.slug}</code>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => openEdit(dept)}
                                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                                            title="Editar"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteCandidate(dept)}
                                            className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                            title="Deletar"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {dept.description && (
                                <p className="text-xs text-slate-600 mb-3 leading-relaxed">{dept.description}</p>
                            )}

                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <Users className="w-3.5 h-3.5" />
                                {teamCounts?.[dept.id] ?? 0} times
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de criação/edição */}
            <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open && !isMutating) setIsModalOpen(false) }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingDept ? 'Editar departamento' : 'Novo departamento'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Nome <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={form.name}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder="Ex: Vendas"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Slug
                            </label>
                            <Input
                                value={form.slug}
                                onChange={(e) => { setSlugEdited(true); setForm((f) => ({ ...f, slug: slugify(e.target.value) })) }}
                                placeholder="vendas"
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-slate-400 mt-1">Identificador único (letras minúsculas, sem espaços)</p>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-slate-700 block mb-1.5">
                                Descrição
                            </label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                placeholder="O que este departamento faz?"
                                rows={3}
                                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none resize-none"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isMutating}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSubmit} disabled={isMutating || !form.name.trim()}>
                            {isMutating ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                editingDept ? 'Salvar' : 'Criar'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirmação de delete */}
            <AlertDialog open={!!deleteCandidate} onOpenChange={(open) => { if (!open) setDeleteCandidate(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover departamento?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja remover o departamento <strong>{deleteCandidate?.name}</strong>?
                            {(teamCounts?.[deleteCandidate?.id ?? ''] ?? 0) > 0 && (
                                <span className="block mt-2 text-amber-700 font-medium">
                                    ⚠️ Este departamento tem {teamCounts?.[deleteCandidate?.id ?? '']} times associados.
                                    Eles ficarão sem departamento após a remoção.
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
