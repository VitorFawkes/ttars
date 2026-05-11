import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { AddWorkspaceInput } from '../../hooks/usePlatformData'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useToast } from '../../contexts/ToastContext'

interface AddWorkspaceDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: AddWorkspaceInput) => Promise<void>
}

type TemplateType = 'generic_3phase' | 'simple_2phase'

export function AddWorkspaceDialog({ isOpen, onClose, onSubmit }: AddWorkspaceDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    template: 'generic_3phase' as TemplateType,
    productName: 'Principal',
    productSlug: 'TRIPS',
  })

  const handleChange = (field: keyof typeof form, value: string | TemplateType) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSlugChange = (value: string) => {
    const slug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    setForm((prev) => ({ ...prev, slug }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) {
      toast({ title: 'Nome do workspace é obrigatório', type: 'error' })
      return
    }

    if (!form.slug.trim()) {
      toast({ title: 'Slug é obrigatório', type: 'error' })
      return
    }

    if (!form.adminEmail.trim()) {
      toast({ title: 'Email do admin é obrigatório', type: 'error' })
      return
    }

    if (!form.adminEmail.includes('@')) {
      toast({ title: 'Email inválido', type: 'error' })
      return
    }

    if (!form.productSlug.trim()) {
      toast({ title: 'Slug do produto é obrigatório', type: 'error' })
      return
    }

    setLoading(true)
    try {
      await onSubmit(form)
      toast({ title: 'Workspace criado com sucesso', type: 'success' })
      setForm({
        name: '',
        slug: '',
        adminEmail: '',
        template: 'generic_3phase',
        productName: 'Principal',
        productSlug: 'TRIPS',
      })
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar workspace'
      toast({ title: message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Novo Workspace</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Nome do Workspace
            </label>
            <Input
              type="text"
              placeholder="Ex: Welcome Events"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Slug (URL)
            </label>
            <Input
              type="text"
              placeholder="ex-welcome-events"
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-slate-500 mt-1">Apenas letras, números e hífens</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Email do Admin
            </label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={form.adminEmail}
              onChange={(e) => handleChange('adminEmail', e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Template de Pipeline
            </label>
            <select
              value={form.template}
              onChange={(e) => handleChange('template', e.target.value as TemplateType)}
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
            >
              <option value="generic_3phase">3 Fases (Pré-Venda, Vendas, Pós-Venda)</option>
              <option value="simple_2phase">2 Fases (Vendas, Entrega)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1.5">
                Nome do Produto
              </label>
              <Input
                type="text"
                placeholder="Principal"
                value={form.productName}
                onChange={(e) => handleChange('productName', e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1.5">
                Slug do Produto
              </label>
              <Input
                type="text"
                placeholder="TRIPS"
                value={form.productSlug}
                onChange={(e) => handleChange('productSlug', e.target.value.toUpperCase())}
                disabled={loading}
              />
              <p className="text-xs text-slate-500 mt-1">TRIPS, WEDDING, EVENTS, etc.</p>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Workspace
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
