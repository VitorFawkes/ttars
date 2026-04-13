import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Plus,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  Pause,
  Play,
  MoreVertical,
  Search,
} from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { usePlatformOrgs } from '../../hooks/usePlatformData'
import { useOrganizations, type ProvisionOrgInput, type ProvisionOrgResult } from '../../hooks/useOrganizations'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table'
import { StatusBadge } from './DashboardPage'

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

interface NewOrgForm {
  name: string
  slug: string
  adminEmail: string
  template: 'generic_3phase' | 'simple_2phase'
  productName: string
  productSlug: string
}

const defaultForm: NewOrgForm = {
  name: '',
  slug: '',
  adminEmail: '',
  template: 'generic_3phase',
  productName: 'Viagens',
  productSlug: 'TRIPS',
}

export default function OrganizationsPage() {
  const { toast } = useToast()
  const { orgs, loading, error, refetch, suspend, resume } = usePlatformOrgs()
  const { isProvisioning, provisionOrganization } = useOrganizations()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<NewOrgForm>(defaultForm)
  const [slugEdited, setSlugEdited] = useState(false)
  const [result, setResult] = useState<ProvisionOrgResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'archived'>('all')

  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [suspending, setSuspending] = useState(false)

  const filtered = orgs.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      if (!o.name.toLowerCase().includes(s) && !o.slug.toLowerCase().includes(s)) return false
    }
    return true
  })

  const handleNameChange = (value: string) => {
    setForm((f) => ({
      ...f,
      name: value,
      slug: slugEdited ? f.slug : slugify(value),
    }))
  }

  const handleSlugChange = (value: string) => {
    setSlugEdited(true)
    setForm((f) => ({ ...f, slug: slugify(value) }))
  }

  const handleOpenModal = () => {
    setForm(defaultForm)
    setSlugEdited(false)
    setResult(null)
    setIsModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name || !form.slug || !form.adminEmail) {
      toast({ title: 'Preencha todos os campos obrigatórios', type: 'error' })
      return
    }
    try {
      const res = await provisionOrganization(form as ProvisionOrgInput)
      setResult(res)
      toast({ title: 'Organização criada com sucesso!', type: 'success' })
      await refetch()
    } catch (err) {
      toast({
        title: 'Erro ao criar organização',
        description: err instanceof Error ? err.message : 'Tente novamente',
        type: 'error',
      })
    }
  }

  const handleCopyInvite = async () => {
    if (!result?.inviteToken) return
    await navigator.clipboard.writeText(result.inviteToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleConfirmSuspend = async () => {
    if (!suspendTarget) return
    setSuspending(true)
    try {
      await suspend(suspendTarget.id, suspendReason.trim() || null)
      toast({ title: `${suspendTarget.name} suspensa`, type: 'success' })
      setSuspendTarget(null)
      setSuspendReason('')
    } catch (err) {
      toast({
        title: 'Erro ao suspender',
        description: err instanceof Error ? err.message : 'Tente novamente',
        type: 'error',
      })
    } finally {
      setSuspending(false)
    }
  }

  const handleResume = async (orgId: string, orgName: string) => {
    try {
      await resume(orgId)
      toast({ title: `${orgName} reativada`, type: 'success' })
    } catch (err) {
      toast({
        title: 'Erro ao reativar',
        description: err instanceof Error ? err.message : 'Tente novamente',
        type: 'error',
      })
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Building2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Tenants</h1>
            <p className="text-sm text-slate-500">Clientes do SaaS. Cada tenant pode ter múltiplos workspaces internos.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={handleOpenModal}>
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Tenant
          </Button>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome ou slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {(['all', 'active', 'suspended', 'archived'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {s === 'all' ? 'Todas' : s === 'active' ? 'Ativas' : s === 'suspended' ? 'Suspensas' : 'Arquivadas'}
            </button>
          ))}
        </div>
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
              <TableHead>Tenant</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-center">Workspaces</TableHead>
              <TableHead className="text-center">Usuários</TableHead>
              <TableHead className="text-center">Cards</TableHead>
              <TableHead>Última atividade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-slate-400 text-sm">
                  {orgs.length === 0 ? 'Nenhum tenant ainda.' : 'Nenhum encontrado com esses filtros.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <Link
                      to={`/platform/organizations/${org.id}`}
                      className="font-medium text-slate-900 hover:text-indigo-600"
                    >
                      {org.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                      {org.slug}
                    </code>
                  </TableCell>
                  <TableCell className="text-center text-sm text-slate-700">
                    {org.workspace_count > 0 ? org.workspace_count : <span className="text-slate-400">—</span>}
                  </TableCell>
                  <TableCell className="text-center text-sm text-slate-700">{org.user_count}</TableCell>
                  <TableCell className="text-center text-sm text-slate-700">
                    {org.open_card_count}
                    <span className="text-slate-400"> / {org.card_count}</span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {org.last_activity
                      ? new Date(org.last_activity).toLocaleDateString('pt-BR')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={org.status} />
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(org.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem asChild>
                          <Link to={`/platform/organizations/${org.id}`}>Ver detalhes</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {org.status === 'active' ? (
                          <DropdownMenuItem
                            onSelect={() => setSuspendTarget({ id: org.id, name: org.name })}
                            className="text-amber-700"
                          >
                            <Pause className="w-3.5 h-3.5 mr-2" />
                            Suspender
                          </DropdownMenuItem>
                        ) : org.status === 'suspended' ? (
                          <DropdownMenuItem
                            onSelect={() => handleResume(org.id, org.name)}
                            className="text-emerald-700"
                          >
                            <Play className="w-3.5 h-3.5 mr-2" />
                            Reativar
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal de criação (reusa provisioning existente) */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          if (!open && !isProvisioning) {
            setIsModalOpen(false)
            setResult(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{result ? 'Organização Criada!' : 'Nova Organização'}</DialogTitle>
          </DialogHeader>

          {result ? (
            <div className="space-y-4 py-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 font-medium mb-1">Organização criada com sucesso</p>
                <p className="text-xs text-green-700">
                  ID: <code className="bg-green-100 px-1 rounded">{result.orgId}</code>
                </p>
              </div>

              {result.inviteToken && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Token de convite do admin</p>
                  <div className="flex gap-2">
                    <Input value={result.inviteToken} readOnly className="font-mono text-xs" />
                    <Button variant="outline" size="sm" onClick={handleCopyInvite}>
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Email de convite foi enviado automaticamente. Token válido por 7 dias.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button
                  onClick={() => {
                    setIsModalOpen(false)
                    setResult(null)
                  }}
                >
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                  Nome da empresa <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Ex: Viagens Premium"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                  Slug (identificador único) <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="viagens-premium"
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                  Email do admin <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="admin@empresa.com"
                  value={form.adminEmail}
                  onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Nome do produto
                  </label>
                  <Input
                    placeholder="Ex: Viagens"
                    value={form.productName}
                    onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Slug do produto
                  </label>
                  <Input
                    placeholder="Ex: TRIPS"
                    value={form.productSlug}
                    onChange={(e) => setForm((f) => ({ ...f, productSlug: e.target.value.toUpperCase() }))}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">
                  Template de pipeline
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'generic_3phase', label: '3 Fases', desc: 'Pré-Venda → Vendas → Pós-Venda' },
                    { value: 'simple_2phase', label: '2 Fases', desc: 'Vendas → Entrega' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, template: opt.value as NewOrgForm['template'] }))}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        form.template === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isProvisioning}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={isProvisioning}>
                  {isProvisioning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando…
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Criar Organização
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de suspensão */}
      <Dialog open={!!suspendTarget} onOpenChange={(open) => !open && setSuspendTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspender {suspendTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              Usuários desta org perderão acesso até a reativação. Dados ficam preservados.
            </p>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">
                Motivo (opcional)
              </label>
              <Input
                placeholder="Ex: inadimplência, solicitação do cliente…"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)} disabled={suspending}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmSuspend} disabled={suspending} className="bg-amber-600 hover:bg-amber-700">
              {suspending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Suspendendo…
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Suspender
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
