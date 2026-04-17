import { useState } from 'react'
import { ChevronDown, ChevronRight, Trash2, FileText } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { KbItem } from '@/hooks/useAgentWizard'

interface KBItemEditorProps {
  item: KbItem
  index: number
  onUpdate: (updates: Partial<KbItem>) => void
  onDelete: () => void
}

export function KBItemEditor({ item, index, onUpdate, onDelete }: KBItemEditorProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'bg-white border rounded-lg transition-shadow',
      expanded ? 'border-indigo-300 shadow-sm' : 'border-slate-200 hover:border-slate-300'
    )}>
      <div className="flex items-stretch">
        <div className="flex items-center justify-center px-3 border-r border-slate-100">
          <FileText className="w-4 h-4 text-slate-400" />
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 flex items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 min-w-0"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm text-slate-900 truncate">
              {item.titulo || <span className="italic text-slate-400">Sem título</span>}
            </p>
            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
              {item.conteudo || <span className="italic">Sem conteúdo</span>}
            </p>
          </div>
          <span className="text-[11px] text-slate-400 flex-shrink-0">#{index + 1}</span>
          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
          }
        </button>
        <div className="flex items-center px-2">
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            aria-label="Excluir item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input
              placeholder="Ex: Qual o prazo de resposta?"
              value={item.titulo}
              onChange={(e) => onUpdate({ titulo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Conteúdo</Label>
            <Textarea
              placeholder="Resposta completa ou informação que o agente deve saber..."
              value={item.conteudo}
              onChange={(e) => onUpdate({ conteudo: e.target.value })}
              className="min-h-[120px]"
            />
          </div>
        </div>
      )}
    </div>
  )
}
