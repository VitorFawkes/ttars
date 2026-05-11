import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { AgentTipo } from '@/hooks/useAiAgents'

export type StatusFilter = 'all' | 'active' | 'paused'

const TIPO_OPTIONS: Array<{ value: AgentTipo | 'all'; label: string }> = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'sales', label: 'Vendas' },
  { value: 'support', label: 'Suporte' },
  { value: 'success', label: 'Sucesso' },
  { value: 'specialist', label: 'Especialista' },
  { value: 'router', label: 'Roteador' },
]

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'paused', label: 'Pausados' },
]

interface AgentHubFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  tipo: AgentTipo | 'all'
  onTipoChange: (value: AgentTipo | 'all') => void
  status: StatusFilter
  onStatusChange: (value: StatusFilter) => void
}

export function AgentHubFilters({
  search, onSearchChange, tipo, onTipoChange, status, onStatusChange,
}: AgentHubFiltersProps) {
  const hasFilters = search !== '' || tipo !== 'all' || status !== 'all'

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por nome ou persona..."
          className="pl-9"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
      </div>

      {/* Tipo chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {TIPO_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onTipoChange(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
              tipo === opt.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-1.5 ml-auto">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onStatusChange(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
              status === opt.value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            {opt.label}
          </button>
        ))}
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { onSearchChange(''); onTipoChange('all'); onStatusChange('all') }}
            className="h-8 text-xs text-slate-500"
          >
            Limpar
          </Button>
        )}
      </div>
    </div>
  )
}
