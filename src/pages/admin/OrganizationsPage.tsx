import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, Users, LayoutGrid, Loader2, Copy, Check, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useOrganizations, type ProvisionOrgInput, type ProvisionOrgResult } from '../../hooks/useOrganizations'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table'

const WELCOME_GROUP_ORG_ID = 'a0000000-0000-0000-0000-000000000001'

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
  // productSlug precisa estar no enum app_product (TRIPS | WEDDING | CORP).
  // Para criar orgs com produtos novos, o admin precisa chamar
  // ensure_app_product_value() primeiro via SQL (até termos UI para isso).
  productName: 'Viagens',
  productSlug: 'TRIPS',
}

export default function OrganizationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { organizations, isLoading, isProvisioning, error, fetchOrganizations, provisionOrganization } = useOrganizations()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState<NewOrgForm>(defaultForm)
  const [slugEdited, setSlugEdited] = useState(false)
  const [result, setResult] = useState<ProvisionOrgResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Guard: apenas admin da Welcome Group
  const isSuperAdmin = profile?.is_admin === true && profile?.org_id === WELCOME_GROUP_ORG_ID
  useEffect(() => {
    if (profile && !isSuperAdmin) {
      navigate('/', { replace: true })
    }
  }, [profile, isSuperAdmin, navigate])

  useEffect(() => {
    if (isSuperAdmin) fetchOrganizations()
  }, [isSuperAdmin, fetchOrganizations])

  // Auto-gerar slug a partir do nome
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

  if (!isSuperAdmin) return null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Building2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Organizações</h1>
            <p className="text-sm text-slate-500">Gerenciar tenants do WelcomeCRM</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrganizations}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={handleOpenModal}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Organização
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organização</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-center">Usuários</TableHead>
              <TableHead className="text-center">Cards Ativos</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criada em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                </TableCell>
              </TableRow>
            ) : organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                  Nenhuma organização encontrada
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{org.name}</div>
                    {org.id === WELCOME_GROUP_ORG_ID && (
                      <span className="text-xs text-indigo-600 font-medium">Welcome Group (master)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                      {org.slug}
                    </code>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm text-slate-700">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {org.user_count}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm text-slate-700">
                      <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                      {org.active_card_count}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        org.active
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }
                    >
                      {org.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(org.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal de criação */}
      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open && !isProvisioning) { setIsModalOpen(false); setResult(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {result ? 'Organização Criada!' : 'Nova Organização'}
            </DialogTitle>
          </DialogHeader>

          {/* Resultado do provisionamento */}
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
                    <Input
                      value={result.inviteToken}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={handleCopyInvite}>
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Envie este token para o admin. Válido por 7 dias.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button onClick={() => { setIsModalOpen(false); setResult(null) }}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* Formulário */
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
                <p className="text-xs text-slate-400 mt-1">Apenas letras minúsculas, números e hífens</p>
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
                    { value: 'generic_3phase', label: '3 Fases', desc: 'Pré-Venda → Vendas → Pós-Venda (9 estágios)' },
                    { value: 'simple_2phase', label: '2 Fases', desc: 'Vendas → Entrega (5 estágios)' },
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
                <Button
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isProvisioning}
                >
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={isProvisioning}>
                  {isProvisioning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Criando...
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
    </div>
  )
}
