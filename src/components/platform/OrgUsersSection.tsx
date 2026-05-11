import { useState } from 'react'
import { Loader2, Shield, MoreVertical, Pause, Play, KeyRound, UserMinus, CheckCircle2, XCircle } from 'lucide-react'
import { usePlatformOrgUsers, type PlatformOrgUser } from '../../hooks/usePlatformData'
import { Button } from '../ui/Button'
import { useToast } from '../../contexts/ToastContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu'

interface OrgUsersSectionProps {
  orgId: string
  className?: string
}

export function OrgUsersSection({ orgId, className = '' }: OrgUsersSectionProps) {
  const { users, loading, error, setActive, removeFromOrg, sendPasswordReset } = usePlatformOrgUsers(orgId)
  const { toast } = useToast()
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  const handleSuspend = async (u: PlatformOrgUser) => {
    const reason = window.prompt(`Suspender ${u.email}?\n\nMotivo (opcional, fica no audit log):`)
    if (reason === null) return
    setBusyUserId(u.id)
    try {
      await setActive(u.id, false, reason || undefined)
      toast({ title: `${u.email} suspenso`, type: 'success' })
    } catch (err) {
      toast({ title: 'Erro ao suspender', description: err instanceof Error ? err.message : '', type: 'error' })
    } finally { setBusyUserId(null) }
  }

  const handleReactivate = async (u: PlatformOrgUser) => {
    setBusyUserId(u.id)
    try {
      await setActive(u.id, true)
      toast({ title: `${u.email} reativado`, type: 'success' })
    } catch (err) {
      toast({ title: 'Erro ao reativar', description: err instanceof Error ? err.message : '', type: 'error' })
    } finally { setBusyUserId(null) }
  }

  const handlePasswordReset = async (u: PlatformOrgUser) => {
    if (!window.confirm(`Enviar email de redefinição de senha para ${u.email}?`)) return
    setBusyUserId(u.id)
    try {
      await sendPasswordReset(u.email)
      toast({ title: 'Email enviado', description: u.email, type: 'success' })
    } catch (err) {
      toast({ title: 'Erro ao enviar email', description: err instanceof Error ? err.message : '', type: 'error' })
    } finally { setBusyUserId(null) }
  }

  const handleRemove = async (u: PlatformOrgUser) => {
    const reason = window.prompt(
      `Remover ${u.email} da organização?\n\nO usuário perde acesso (soft delete — dados preservados).\n\nMotivo (opcional):`
    )
    if (reason === null) return
    setBusyUserId(u.id)
    try {
      await removeFromOrg(u.id, reason || undefined)
      toast({ title: `${u.email} removido`, type: 'success' })
    } catch (err) {
      toast({ title: 'Erro ao remover', description: err instanceof Error ? err.message : '', type: 'error' })
    } finally { setBusyUserId(null) }
  }

  return (
    <section className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}>
      <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Usuários ({users.length})
        </h2>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </header>

      {error && (
        <div className="px-5 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">
          {error}
        </div>
      )}

      {users.length === 0 && !loading ? (
        <div className="px-5 py-6 text-sm text-slate-500">Nenhum usuário nesta organização.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {users.map((u) => {
            const suspended = !u.active || (u.banned_until && new Date(u.banned_until) > new Date())
            return (
              <div key={u.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {u.nome ?? u.email}
                    </span>
                    {u.is_admin && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5">
                        Admin
                      </span>
                    )}
                    {u.is_platform_admin && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
                        <Shield className="w-2.5 h-2.5" /> Platform
                      </span>
                    )}
                    {suspended && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5">
                        <XCircle className="w-2.5 h-2.5" /> Suspenso
                      </span>
                    )}
                    {!suspended && u.last_sign_in_at && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span className="truncate">{u.email}</span>
                    <span>·</span>
                    <span>{u.org_name}</span>
                    {u.last_sign_in_at && (
                      <>
                        <span>·</span>
                        <span>Último login: {new Date(u.last_sign_in_at).toLocaleDateString('pt-BR')}</span>
                      </>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={busyUserId === u.id} className="h-8 w-8 p-0">
                      {busyUserId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => handlePasswordReset(u)}>
                      <KeyRound className="w-3.5 h-3.5 mr-2" /> Enviar reset de senha
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {suspended ? (
                      <DropdownMenuItem onSelect={() => handleReactivate(u)} className="text-emerald-700">
                        <Play className="w-3.5 h-3.5 mr-2" /> Reativar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => handleSuspend(u)} className="text-amber-700">
                        <Pause className="w-3.5 h-3.5 mr-2" /> Suspender
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => handleRemove(u)} className="text-rose-700">
                      <UserMinus className="w-3.5 h-3.5 mr-2" /> Remover da organização
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
