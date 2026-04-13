import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Zap, Plus, MoreHorizontal, MessageSquare, CheckSquare, ArrowRightLeft,
  Layers, Search, Activity, Trash2, Pencil, BarChart3, LayoutList,
} from 'lucide-react'

import { useAutomations, type AutomationItem } from '@/hooks/useAutomations'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { EVENT_TYPE_LABELS } from '@/lib/automation-recipes'
import { GlobalMonitor } from './components/GlobalMonitor'

type ActionFilter = 'all' | 'send_message' | 'create_task' | 'change_stage' | 'start_cadence' | 'cadence_steps'

const ACTION_STYLE: Record<string, { icon: typeof MessageSquare; tint: string; label: string }> = {
  send_message: { icon: MessageSquare, tint: 'bg-indigo-50 text-indigo-700 border-indigo-200', label: 'Mensagem' },
  create_task: { icon: CheckSquare, tint: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Tarefa' },
  change_stage: { icon: ArrowRightLeft, tint: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Mudar etapa' },
  start_cadence: { icon: Layers, tint: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Cadência' },
  cadence_steps: { icon: Layers, tint: 'bg-purple-50 text-purple-700 border-purple-200', label: 'Cadência (steps)' },
}

function ActionBadge({ actionType }: { actionType: string }) {
  const s = ACTION_STYLE[actionType] || ACTION_STYLE.create_task
  const Icon = s.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border',
        s.tint
      )}
    >
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  )
}

function describeEvent(item: AutomationItem): string {
  if (!item.event_type) return 'Gatilho: cadência (manual ou por regra)'
  const base = EVENT_TYPE_LABELS[item.event_type as keyof typeof EVENT_TYPE_LABELS] || item.event_type
  return `Quando: ${base}`
}

function AutomationCard({
  item,
  onToggle,
  onEdit,
  onMonitor,
  onDelete,
}: {
  item: AutomationItem
  onToggle: (next: boolean) => void
  onEdit: () => void
  onMonitor: () => void
  onDelete: () => void
}) {
  const stats = item.stats
  const statsLine: string[] = []
  if (stats.triggered_count !== undefined) statsLine.push(`${stats.triggered_count} disparos (7d)`)
  if (stats.active_instances !== undefined) statsLine.push(`${stats.active_instances} ativas`)
  if (stats.completed_instances !== undefined) statsLine.push(`${stats.completed_instances} concluídas`)

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-slate-900 truncate">{item.name}</h3>
            <ActionBadge actionType={item.action_type} />
            {!item.is_active && (
              <Badge variant="outline" className="text-xs text-slate-500">Pausada</Badge>
            )}
          </div>
          <p className="text-sm text-slate-600">{describeEvent(item)}</p>
          {statsLine.length > 0 && (
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              {statsLine.join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Switch
            checked={item.is_active}
            onCheckedChange={onToggle}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-3 h-3 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onMonitor}>
                <BarChart3 className="w-3 h-3 mr-2" />
                Ver execuções
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600">
                <Trash2 className="w-3 h-3 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

export default function AutomationsListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { items, isLoading, toggleActive, remove } = useAutomations()
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')

  const activeTab = searchParams.get('tab') === 'monitor' ? 'monitor' : 'list'
  const setActiveTab = (tab: string) => {
    if (tab === 'list') setSearchParams({})
    else setSearchParams({ tab })
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (actionFilter !== 'all' && item.action_type !== actionFilter) return false
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [items, search, actionFilter])

  const stats = useMemo(() => {
    const ativas = items.filter((i) => i.is_active).length
    const msgs = items.filter((i) => i.action_type === 'send_message').length
    const cads = items.filter((i) => i.action_type === 'start_cadence' || i.action_type === 'cadence_steps').length
    return [
      { label: 'Ativas', value: ativas, color: 'green' as const },
      { label: 'Mensagens', value: msgs, color: 'blue' as const },
      { label: 'Cadências', value: cads, color: 'purple' as const },
    ]
  }, [items])

  const handleToggle = async (item: AutomationItem, next: boolean) => {
    try {
      await toggleActive.mutateAsync({ item, active: next })
      toast.success(next ? 'Automação ativada' : 'Automação pausada')
    } catch {
      toast.error('Erro ao atualizar automação')
    }
  }

  const handleDelete = async (item: AutomationItem) => {
    if (!window.confirm(`Excluir "${item.name}"? Essa ação não pode ser desfeita.`)) return
    try {
      await remove.mutateAsync(item)
      toast.success('Automação excluída')
    } catch {
      toast.error('Erro ao excluir automação')
    }
  }

  const handleEdit = (item: AutomationItem) => {
    if (item.source === 'cadence_template') {
      const path = item.execution_mode === 'blocks'
        ? `/settings/automations/automacao/${item.id}`
        : `/settings/automations/${item.id}`
      navigate(path)
    } else {
      navigate(`/settings/automations/${item.id}`)
    }
  }

  const handleMonitor = (item: AutomationItem) => {
    if (item.source === 'cadence_template') {
      navigate(`/settings/automations/${item.id}/monitor`)
    } else {
      navigate(`/settings/automations?tab=monitor`)
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Automações"
        subtitle="Quando algo acontece no card, dispara uma ação (mensagem, tarefa, mudança de etapa ou cadência)"
        icon={<Zap className="w-5 h-5" />}
        stats={stats}
        actions={
          activeTab === 'list' ? (
            <Button onClick={() => navigate('/settings/automations/automacao/new')} className="gap-2">
              <Plus className="w-4 h-4" />
              Nova automação
            </Button>
          ) : null
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white border border-slate-200 p-1">
          <TabsTrigger value="list" className="gap-2">
            <LayoutList className="w-4 h-4" />
            Lista
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-2">
            <Activity className="w-4 h-4" />
            Monitor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar automação..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {(['all', 'send_message', 'create_task', 'change_stage', 'start_cadence', 'cadence_steps'] as ActionFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setActionFilter(f)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors whitespace-nowrap',
                    actionFilter === f
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {f === 'all' ? 'Tudo' : ACTION_STYLE[f]?.label || f}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
              <Zap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">
                {items.length === 0 ? 'Nenhuma automação criada' : 'Nenhum resultado para os filtros'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {items.length === 0
                  ? 'Comece escolhendo uma receita pronta ou criando do zero'
                  : 'Tente ajustar a busca ou limpar o filtro'}
              </p>
              {items.length === 0 && (
                <Button
                  onClick={() => navigate('/settings/automations/automacao/new')}
                  className="mt-6 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nova automação
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => (
                <AutomationCard
                  key={item.uid}
                  item={item}
                  onToggle={(next) => handleToggle(item, next)}
                  onEdit={() => handleEdit(item)}
                  onMonitor={() => handleMonitor(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="monitor" className="mt-6">
          <GlobalMonitor />
        </TabsContent>
      </Tabs>
    </>
  )
}
