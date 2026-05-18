/**
 * Visão geral — dashboard compacto com progresso + atalho pro próximo passo.
 * Não é tela cheia anymore — apenas mostra resumo. A sidebar é quem navega.
 */

import { ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from './Ui'
import { CHAPTERS, PATRICIA, BUSINESS, type ChapterId } from './data-real'

interface Props {
  onOpenChapter: (id: ChapterId) => void
}

export function TrilhaHome({ onOpenChapter }: Props) {
  const completed = CHAPTERS.filter(c => c.isComplete).length
  const total = CHAPTERS.length
  const pct = Math.round((completed / total) * 100)
  const next = CHAPTERS.find(c => !c.isComplete)

  return (
    <article className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-500">
          {BUSINESS.company_name} · agente IA
        </p>
        <h1 className="text-[26px] font-semibold text-slate-900 tracking-tight mt-1 leading-tight">
          Construindo a {PATRICIA.nome}
        </h1>
        <p className="text-[14px] text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
          7 passos pra montar como ela conversa, qualifica e passa o bastão pra Wedding Planner.
          Use a barra lateral pra pular entre os passos.
        </p>
      </header>

      {/* Progresso + próximo passo lado a lado */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <div className="flex items-baseline justify-between mb-2.5">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
              Progresso
            </p>
            <span className="text-[12px] font-mono text-slate-500 tabular-nums">{pct}%</span>
          </div>
          <p className="text-[20px] font-semibold text-slate-900 tabular-nums">
            {completed}<span className="text-slate-400 font-normal text-[14px]"> de {total}</span>
          </p>
          <p className="text-[12px] text-slate-500 mt-0.5">passos configurados</p>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>

        {next ? (
          <button
            onClick={() => onOpenChapter(next.id)}
            className="text-left bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 hover:bg-indigo-100/60 transition-colors group"
          >
            <div className="flex items-baseline justify-between mb-2.5">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-indigo-600">
                Próximo passo
              </p>
              <span className="text-[10px] font-mono text-indigo-400 tabular-nums">
                {String(next.num).padStart(2, '0')}
              </span>
            </div>
            <p className="text-[15px] font-semibold text-indigo-900">{next.title}</p>
            <p className="text-[12px] text-indigo-700 mt-1 line-clamp-2">{next.summary}</p>
            <p className="text-[11px] text-indigo-600 mt-2.5 inline-flex items-center gap-1 font-medium group-hover:gap-2 transition-all">
              Continuar <ArrowRight className="w-3 h-3" />
            </p>
          </button>
        ) : (
          <Card>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="text-[13px] font-semibold text-slate-900">Tudo configurado</p>
                <p className="text-[12px] text-slate-500">Use os atalhos pra testar ou monitorar.</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Lista compacta */}
      <Card title="Os 7 passos" dense>
        <ul className="divide-y divide-slate-100">
          {CHAPTERS.map(c => (
            <li key={c.id}>
              <button
                onClick={() => onOpenChapter(c.id)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left group"
              >
                <StatusDot complete={c.isComplete} isNext={c.id === next?.id} />
                <span className="font-mono text-[11px] text-slate-400 tabular-nums w-6 flex-shrink-0">
                  {String(c.num).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-900">{c.title}</p>
                  <p className="text-[11px] text-slate-500 truncate">{c.summary}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </article>
  )
}

function StatusDot({ complete, isNext }: { complete: boolean; isNext: boolean }) {
  if (complete) {
    return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
  }
  if (isNext) {
    return <AlertCircle className="w-4 h-4 text-indigo-500 flex-shrink-0" />
  }
  return <span className={cn('w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0')} />
}
