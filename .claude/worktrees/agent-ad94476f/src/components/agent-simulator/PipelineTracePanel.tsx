import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Check, X, SkipForward, AlertTriangle, Clock, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineTrace, PipelineStage } from '@/hooks/useAgentSimulator'

interface PipelineTracePanelProps {
  trace: PipelineTrace | null
}

const STATUS_CONFIG: Record<PipelineStage['status'], { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; color: string; label: string }> = {
  ok: { icon: Check, color: 'text-green-600 bg-green-100', label: 'OK' },
  blocked: { icon: X, color: 'text-red-600 bg-red-100', label: 'Bloqueado' },
  corrected: { icon: AlertTriangle, color: 'text-amber-600 bg-amber-100', label: 'Corrigido' },
  skipped: { icon: SkipForward, color: 'text-slate-400 bg-slate-100', label: 'Pulado' },
  error: { icon: X, color: 'text-red-600 bg-red-100', label: 'Erro' },
}

function StageCard({ stage, index }: { stage: PipelineStage; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[stage.status]
  const StatusIcon = cfg.icon

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full p-3 flex items-center gap-3 hover:bg-slate-50 text-left"
      >
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', cfg.color)}>
          <StatusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono">{index + 1}.</span>
            <p className="text-sm font-medium text-slate-900">{stage.name}</p>
          </div>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">{stage.summary}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          {stage.tokens !== undefined && stage.tokens > 0 && <span>{stage.tokens}t</span>}
          {stage.latency_ms !== undefined && <span>{stage.latency_ms}ms</span>}
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>
      {expanded && stage.details && (
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
          <pre className="text-[10px] text-slate-700 whitespace-pre-wrap break-all font-mono">
            {JSON.stringify(stage.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export function PipelineTracePanel({ trace }: PipelineTracePanelProps) {
  if (!trace) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
        <Zap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600">Pipeline vazio</p>
        <p className="text-xs text-slate-500 mt-1">Envie uma mensagem para ver o que acontece por trás</p>
      </div>
    )
  }

  const assertionEntries = Object.entries(trace.assertions)

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Resumo</p>
          {trace.validator_passed ? (
            <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              Aprovado
            </span>
          ) : (
            <span className="text-[11px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
              Bloqueado
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg px-2 py-1.5">
            <p className="text-[10px] text-slate-500">Tokens</p>
            <p className="text-sm font-semibold text-slate-900">{trace.total_tokens}</p>
          </div>
          <div className="bg-slate-50 rounded-lg px-2 py-1.5">
            <p className="text-[10px] text-slate-500 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Latência
            </p>
            <p className="text-sm font-semibold text-slate-900">{trace.total_latency_ms}ms</p>
          </div>
        </div>
      </div>

      {/* Stages */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Etapas do pipeline</p>
        {trace.stages.map((stage, idx) => (
          <StageCard key={idx} stage={stage} index={idx} />
        ))}
      </div>

      {/* Skills + KB */}
      {(trace.skills_invoked.length > 0 || trace.kb_items_retrieved.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          {trace.skills_invoked.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-slate-600 mb-1">Skills invocadas</p>
              <div className="flex flex-wrap gap-1">
                {trace.skills_invoked.map((skill) => (
                  <span key={skill} className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
          {trace.kb_items_retrieved.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-slate-600 mb-1">Itens consultados</p>
              <div className="space-y-0.5">
                {trace.kb_items_retrieved.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-700 truncate flex-1">{item.titulo}</span>
                    <span className="text-slate-400 font-mono">{item.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assertions */}
      {assertionEntries.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Checagens</p>
          <div className="space-y-1">
            {assertionEntries.map(([label, passed]) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                {passed === true ? (
                  <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" strokeWidth={3} />
                ) : passed === false ? (
                  <X className="w-3.5 h-3.5 text-red-600 flex-shrink-0" strokeWidth={3} />
                ) : (
                  <div className="w-3.5 h-3.5 flex-shrink-0" />
                )}
                <span className={cn(
                  'truncate',
                  passed === true ? 'text-slate-700' : passed === false ? 'text-red-700' : 'text-slate-400'
                )}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
