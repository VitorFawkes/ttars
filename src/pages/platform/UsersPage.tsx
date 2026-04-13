import { useState } from 'react'
import { Search, Loader2, Shield, ShieldOff, Users as UsersIcon } from 'lucide-react'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { usePlatformUsers } from '../../hooks/usePlatformData'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table'

export default function UsersPage() {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const { users, loading, error, setPlatformAdmin } = usePlatformUsers(search)
  const [busyId, setBusyId] = useState<string | null>(null)

  const togglePlatformAdmin = async (userId: string, current: boolean, email: string) => {
    const target = !current
    const label = target ? 'promover' : 'revogar'
    if (!window.confirm(`Confirma ${label} ${email} como platform admin?`)) return
    setBusyId(userId)
    try {
      await setPlatformAdmin(userId, target)
      toast({
        title: target ? 'Platform admin promovido' : 'Acesso platform revogado',
        type: 'success',
      })
    } catch (err) {
      toast({
        title: 'Erro',
        description: err instanceof Error ? err.message : 'Tente novamente',
        type: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <UsersIcon className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Usuários</h1>
            <p className="text-sm text-slate-500">Browser cross-org — últimos 100 usuários.</p>
          </div>
        </div>
      </header>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por email ou nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Organização</TableHead>
              <TableHead>Workspace Ativo</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-sm text-slate-400">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-slate-900">{u.email}</TableCell>
                  <TableCell className="text-sm text-slate-700">{u.nome ?? '—'}</TableCell>
                  <TableCell className="text-sm text-slate-600">{u.org_name}</TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {u.active_org_id && u.active_org_id !== u.org_id ? (
                      <span className="text-slate-600">{u.active_org_name}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {u.is_platform_admin && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
                          <Shield className="w-3 h-3" /> Platform
                        </span>
                      )}
                      {u.is_admin && (
                        <span className="inline-flex items-center text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                          Admin
                        </span>
                      )}
                      {!u.is_platform_admin && !u.is_admin && (
                        <span className="text-xs text-slate-400">Membro</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => togglePlatformAdmin(u.id, u.is_platform_admin, u.email)}
                      disabled={busyId === u.id}
                    >
                      {busyId === u.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : u.is_platform_admin ? (
                        <>
                          <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
                          Revogar
                        </>
                      ) : (
                        <>
                          <Shield className="w-3.5 h-3.5 mr-1.5" />
                          Promover
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
