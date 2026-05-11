import { MoreVertical, Copy, Trash2, MessageSquare, BarChart3, Edit3 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { AiAgent } from '@/hooks/useAiAgents'
import { TIPO_CONFIG } from './agent-constants'

interface AgentCardProps {
  agent: AiAgent
  conversationsCount?: number
  resolutionRate?: number | null
  onToggleActive: (id: string, currentActive: boolean) => void
  onEdit: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onViewConversations: (id: string) => void
  onViewAnalytics: (id: string) => void
  onClick: (id: string) => void
  isTogglePending?: boolean
}

export function AgentCard({
  agent,
  conversationsCount,
  resolutionRate,
  onToggleActive,
  onEdit,
  onDuplicate,
  onDelete,
  onViewConversations,
  onViewAnalytics,
  onClick,
  isTogglePending,
}: AgentCardProps) {
  const tipoConfig = TIPO_CONFIG[agent.tipo]
  const TipoIcon = tipoConfig.icon
  const skillCount = agent.ai_agent_skills?.filter(s => s.enabled)?.length ?? 0
  const lineCount = agent.ai_agent_phone_line_config?.filter(l => l.ativa)?.length ?? 0

  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      onClick={() => onClick(agent.id)}
      className={cn(
        'group relative bg-white border border-slate-200 rounded-xl p-5 cursor-pointer',
        'transition-all duration-200 hover:shadow-md hover:border-slate-300',
        !agent.ativa && 'opacity-70'
      )}
    >
      {/* Accent bar */}
      <div className={cn('absolute top-0 left-0 right-0 h-1 rounded-t-xl', tipoConfig.accent, !agent.ativa && 'opacity-30')} />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', tipoConfig.color)}>
            <TipoIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 truncate tracking-tight">{agent.nome}</h3>
            {agent.persona ? (
              <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{agent.persona}</p>
            ) : (
              <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">Sem persona definida</p>
            )}
          </div>
        </div>

        <div onClick={stopPropagation} className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <MoreVertical className="w-4 h-4 text-slate-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(agent.id)}>
                <Edit3 className="w-3.5 h-3.5 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(agent.id)}>
                <Copy className="w-3.5 h-3.5 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onViewConversations(agent.id)}>
                <MessageSquare className="w-3.5 h-3.5 mr-2" />
                Ver conversas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewAnalytics(agent.id)}>
                <BarChart3 className="w-3.5 h-3.5 mr-2" />
                Analytics
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(agent.id)} className="text-red-600 focus:text-red-600">
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Badge variant="outline" className={cn('text-xs font-medium border', tipoConfig.color)}>
          {tipoConfig.label}
        </Badge>
        {lineCount > 0 && (
          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">
            {lineCount} linha{lineCount > 1 ? 's' : ''} WhatsApp
          </Badge>
        )}
        {skillCount > 0 && (
          <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
            {skillCount} skill{skillCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-50 rounded-lg px-3 py-2.5">
          <p className="text-xs text-slate-500 font-medium">Conversas (7d)</p>
          <p className="text-lg font-semibold text-slate-900 tracking-tight">
            {conversationsCount ?? <span className="text-slate-300">—</span>}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg px-3 py-2.5">
          <p className="text-xs text-slate-500 font-medium">Taxa resolução</p>
          <p className="text-lg font-semibold text-slate-900 tracking-tight">
            {resolutionRate != null ? `${Math.round(resolutionRate * 100)}%` : <span className="text-slate-300">—</span>}
          </p>
        </div>
      </div>

      {/* Footer: Toggle + Status */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100" onClick={stopPropagation}>
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', agent.ativa ? 'bg-green-500' : 'bg-slate-300')} />
          <span className="text-xs font-medium text-slate-600">
            {agent.ativa ? 'Ativo' : 'Pausado'}
          </span>
        </div>
        <Switch
          checked={agent.ativa}
          onCheckedChange={() => onToggleActive(agent.id, agent.ativa)}
          disabled={isTogglePending}
        />
      </div>
    </div>
  )
}
