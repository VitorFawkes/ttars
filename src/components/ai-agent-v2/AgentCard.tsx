import { MoreVertical, Copy, Trash2, MessageSquare, BarChart3, Edit3, AlertTriangle, Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useTogglePhoneLineConfig, type AiAgent } from '@/hooks/v2/useAiAgents'
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
  const phoneLines = agent.ai_agent_phone_line_config ?? []
  const lineCount = phoneLines.filter(l => l.ativa).length
  const linkedLines = phoneLines.length
  const showLineWarning = agent.ativa && lineCount === 0
  const toggleLine = useTogglePhoneLineConfig(agent.id)

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
        {agent.execution_backend === 'n8n' && (
          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
            n8n
          </Badge>
        )}
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

      {/* Aviso: agente ligada mas nenhuma linha ativa → não responde */}
      {showLineWarning && (
        <div
          onClick={stopPropagation}
          className="mb-3 flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-800 font-medium">
              {linkedLines === 0 ? 'Sem linha WhatsApp vinculada' : 'Nenhuma linha WhatsApp ativa'}
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              {linkedLines === 0
                ? 'Agente ligada mas não tem como receber mensagens. Vincule uma linha no editor.'
                : 'A agente está ligada mas não vai responder. Ative pelo menos uma linha.'}
            </p>
            {linkedLines === 1 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 mt-1.5 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
                disabled={toggleLine.isPending}
                onClick={() => {
                  const line = phoneLines[0]
                  toggleLine.mutate(
                    { configId: line.id, ativa: true },
                    {
                      onSuccess: () => toast.success(`Linha "${line.whatsapp_linha_config?.phone_number_label || 'WhatsApp'}" ativada`),
                      onError: () => toast.error('Erro ao ativar linha'),
                    },
                  )
                }}
              >
                {toggleLine.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Ativar {phoneLines[0].whatsapp_linha_config?.phone_number_label || 'linha'}
              </Button>
            )}
            {linkedLines >= 2 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 mt-1.5 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => onEdit(agent.id)}
              >
                Gerenciar linhas
              </Button>
            )}
          </div>
        </div>
      )}

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
