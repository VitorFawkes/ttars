import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { InviteAdminInput } from '../../hooks/usePlatformData'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useToast } from '../../contexts/ToastContext'

interface InviteAdminDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: InviteAdminInput) => Promise<void>
}

type RoleType = 'admin' | 'sales' | 'support'

export function InviteAdminDialog({ isOpen, onClose, onSubmit }: InviteAdminDialogProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email: '',
    role: 'admin' as RoleType,
  })

  const handleChange = (field: keyof typeof form, value: string | RoleType) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.email.trim()) {
      toast({ title: 'Email é obrigatório', type: 'error' })
      return
    }

    if (!form.email.includes('@')) {
      toast({ title: 'Email inválido', type: 'error' })
      return
    }

    setLoading(true)
    try {
      await onSubmit(form)
      toast({ title: 'Convite enviado com sucesso', type: 'success' })
      setForm({
        email: '',
        role: 'admin',
      })
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar convite'
      toast({ title: message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Convidar Admin</h2>
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
            <label className="block text-sm font-medium text-slate-900 mb-1.5">Email</label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">Role</label>
            <select
              value={form.role}
              onChange={(e) => handleChange('role', e.target.value as RoleType)}
              disabled={loading}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
            >
              <option value="admin">Administrador (acesso total)</option>
              <option value="sales">Vendedor (pipeline e cards)</option>
              <option value="support">Suporte (pós-venda)</option>
            </select>
          </div>

          <p className="text-xs text-slate-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            Um email de convite será enviado com link de acesso válido por 7 dias.
          </p>

          <div className="flex gap-3 pt-2">
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
              Enviar Convite
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
