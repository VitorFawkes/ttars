import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Check,
  XCircle,
} from 'lucide-react'
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

type Escopo = 'total' | 'parcial' | 'mudanca' | 'qualquer'

interface MotivoRow {
  id: string
  nome: string
  ativo: boolean
  escopo: Escopo
  ordem: number
}

const ESCOPO_LABEL: Record<Escopo, string> = {
  qualquer: 'Qualquer cancelamento',
  total: 'Apenas total',
  parcial: 'Apenas parcial',
  mudanca: 'Apenas mudança brusca',
}

const ESCOPO_BADGE: Record<Escopo, string> = {
  qualquer: 'bg-slate-100 text-slate-700 border-slate-200',
  total: 'bg-red-100 text-red-700 border-red-200',
  parcial: 'bg-amber-100 text-amber-700 border-amber-200',
  mudanca: 'bg-violet-100 text-violet-700 border-violet-200',
}

export default function CancellationReasonManagement() {
  const queryClient = useQueryClient()
  const { org } = useOrg()
  const activeOrgId = org?.id

  const [newReason, setNewReason] = useState('')
  const [newEscopo, setNewEscopo] = useState<Escopo>('qualquer')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingEscopo, setEditingEscopo] = useState<Escopo>('qualquer')

  const { data: reasons, isLoading } = useQuery({
    queryKey: ['motivos-cancelamento-admin', activeOrgId],
    queryFn: async (): Promise<MotivoRow[]> => {
      if (!activeOrgId) return []
      const { data, error } = await supabase
        .from('motivos_cancelamento')
        .select('id, nome, ativo, escopo, ordem')
        .eq('org_id', activeOrgId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })
      if (error) throw error
      return (data ?? []) as MotivoRow[]
    },
    enabled: !!activeOrgId,
  })

  const createMutation = useMutation({
    mutationFn: async ({ nome, escopo }: { nome: string; escopo: Escopo }) => {
      if (!nome.trim()) throw new Error('O nome não pode estar vazio')
      if (!activeOrgId) throw new Error('Workspace ativo não encontrado')
      const { error } = await supabase.from('motivos_cancelamento').insert([
        {
          org_id: activeOrgId,
          nome: nome.trim(),
          escopo,
          ativo: true,
          ordem: (reasons?.length ?? 0) + 1,
        },
      ])
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Motivo adicionado!')
      setNewReason('')
      setNewEscopo('qualquer')
      queryClient.invalidateQueries({ queryKey: ['motivos-cancelamento-admin'] })
      queryClient.invalidateQueries({ queryKey: ['motivos_cancelamento'] })
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('motivos_cancelamento') as any).update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Status atualizado!')
      queryClient.invalidateQueries({ queryKey: ['motivos-cancelamento-admin'] })
      queryClient.invalidateQueries({ queryKey: ['motivos_cancelamento'] })
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('motivos_cancelamento').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Motivo removido!')
      queryClient.invalidateQueries({ queryKey: ['motivos-cancelamento-admin'] })
      queryClient.invalidateQueries({ queryKey: ['motivos_cancelamento'] })
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })

  const renameMutation = useMutation({
    mutationFn: async ({ id, nome, escopo }: { id: string; nome: string; escopo: Escopo }) => {
      if (!nome.trim()) throw new Error('O nome não pode estar vazio')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('motivos_cancelamento') as any)
        .update({ nome: nome.trim(), escopo })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Motivo atualizado!')
      setEditingId(null)
      setEditingName('')
      queryClient.invalidateQueries({ queryKey: ['motivos-cancelamento-admin'] })
      queryClient.invalidateQueries({ queryKey: ['motivos_cancelamento'] })
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })

  const startEditing = (r: MotivoRow) => {
    setEditingId(r.id)
    setEditingName(r.nome)
    setEditingEscopo(r.escopo)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingName('')
  }

  const saveEditing = () => {
    if (editingId && editingName.trim()) {
      renameMutation.mutate({ id: editingId, nome: editingName, escopo: editingEscopo })
    }
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ nome: newReason, escopo: newEscopo })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
      <AdminPageHeader
        title="Motivos de Cancelamento"
        subtitle="Gerencie as opções disponíveis ao abrir cancelamento de uma viagem após o aceite."
        icon={<AlertTriangle className="w-6 h-6 text-amber-500" />}
        actions={null}
        stats={[]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-sm bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-slate-500" />
                Lista de Motivos
              </CardTitle>
              <CardDescription>
                Aparecem no dropdown quando alguém abre cancelamento em um card de viagem.
                Use o &ldquo;escopo&rdquo; pra restringir motivos a tipos específicos (ex: &ldquo;Mudança de
                destino&rdquo; só faz sentido em mudança brusca).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Add Form */}
              <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 mb-8">
                <Input
                  placeholder="Ex: Problema com fornecedor"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="flex-1 bg-white"
                />
                <select
                  value={newEscopo}
                  onChange={(e) => setNewEscopo(e.target.value as Escopo)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="qualquer">Qualquer cancelamento</option>
                  <option value="total">Apenas total</option>
                  <option value="parcial">Apenas parcial</option>
                  <option value="mudanca">Apenas mudança brusca</option>
                </select>
                <Button
                  type="submit"
                  disabled={!newReason.trim() || createMutation.isPending}
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Adicionar
                </Button>
              </form>

              {/* List */}
              <div className="space-y-2">
                {reasons?.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    Nenhum motivo cadastrado ainda.
                  </div>
                ) : (
                  reasons?.map((reason) => (
                    <div
                      key={reason.id}
                      className={cn(
                        'group flex items-center justify-between gap-3 p-3 rounded-lg border transition-all duration-200',
                        reason.ativo
                          ? 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'
                          : 'bg-slate-50 border-slate-100 opacity-60',
                      )}
                    >
                      {editingId === reason.id ? (
                        <>
                          <div className="flex items-center gap-2 flex-1 mr-2">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditing()
                                if (e.key === 'Escape') cancelEditing()
                              }}
                              className="h-8 text-sm bg-white flex-1"
                              autoFocus
                            />
                            <select
                              value={editingEscopo}
                              onChange={(e) => setEditingEscopo(e.target.value as Escopo)}
                              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                            >
                              <option value="qualquer">Qualquer</option>
                              <option value="total">Total</option>
                              <option value="parcial">Parcial</option>
                              <option value="mudanca">Mudança</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={saveEditing}
                              disabled={!editingName.trim() || renameMutation.isPending}
                              title="Salvar"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              {renameMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={cancelEditing}
                              title="Cancelar"
                              className="h-8 w-8 text-slate-400 hover:text-slate-700"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span
                              className={cn(
                                'font-medium text-sm',
                                reason.ativo ? 'text-slate-700' : 'text-slate-400 line-through',
                              )}
                            >
                              {reason.nome}
                            </span>
                            <Badge variant="outline" className={cn('text-xs', ESCOPO_BADGE[reason.escopo])}>
                              {ESCOPO_LABEL[reason.escopo]}
                            </Badge>
                            {!reason.ativo && (
                              <Badge variant="outline" className="text-xs text-slate-400 border-slate-200">
                                Inativo
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditing(reason)}
                              title="Renomear"
                              className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleActiveMutation.mutate({ id: reason.id, ativo: !reason.ativo })}
                              title={reason.ativo ? 'Desativar' : 'Ativar'}
                              className="h-8 w-8 text-slate-400 hover:text-slate-700"
                            >
                              {reason.ativo ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm('Tem certeza que deseja excluir este motivo?')) {
                                  deleteMutation.mutate(reason.id)
                                }
                              }}
                              title="Excluir permanentemente"
                              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-amber-50/50 border-amber-100 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Como usar
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-800 space-y-3">
              <p>
                Motivos de cancelamento são <strong>separados</strong> de motivos de perda. Cancelamento
                acontece em viagens <em>já vendidas</em> que precisam ser ajustadas.
              </p>
              <p>
                O campo <strong>escopo</strong> filtra quais motivos aparecem em cada tipo de
                cancelamento: total / parcial / mudança brusca. &ldquo;Qualquer&rdquo; aparece em todos.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
