import { useState, useMemo } from 'react'
import { Search, AlertTriangle, ChevronRight, Eye } from 'lucide-react'
import { useAgentMoments, type PlaybookMoment, resolveSlotPriority } from '@/hooks/playbook/useAgentMoments'
import { useAgentSilentSignals } from '@/hooks/playbook/useAgentSilentSignals'
import { useAgentScoring } from '@/hooks/useAgentScoring'
import { MomentDrawer } from '../MomentDrawer'
import { SilentSignalsSection } from '../../sections/SilentSignalsSection'

interface Props {
  agentId: string
  agentName: string
  companyName: string
}

/**
 * Sub-aba "Sondagem" da área "Como ela conversa" (UI v3 — Fase 3).
 *
 * Mostra os 4-6 dados que a agente coleta numa conversa:
 *   - Slots obrigatórios (data, destino, convidados, investimento)
 *   - Sinais silenciosos (família ajuda, viagem internacional, referência)
 *
 * Inovação: cruza sinais silenciosos com regras de pontuação.
 * Se uma regra de scoring espera um sinal que não está configurado,
 * mostra alerta inline.
 *
 * Slots vêm do moment com discovery_config (geralmente moment_key='sondagem').
 * Editar um slot = abrir o drawer do moment correspondente.
 */
export function SondagemSection({ agentId, agentName, companyName }: Props) {
  const { moments } = useAgentMoments(agentId)
  const { signals } = useAgentSilentSignals(agentId)
  const { rules: scoringRules, config: scoringConfig } = useAgentScoring(agentId)
  const [drawerMomentId, setDrawerMomentId] = useState<string | null>(null)

  // Encontra o moment de descoberta principal (geralmente "sondagem")
  const sondagemMoment = useMemo(
    () => moments.find(m => m.kind === 'flow' && m.discovery_config && m.discovery_config.slots.length > 0) ?? null,
    [moments]
  )

  const drawerMoment = useMemo(
    () => moments.find(m => m.id === drawerMomentId) ?? null,
    [moments, drawerMomentId]
  )

  // Detecta sinais que regras de scoring esperam mas não estão configurados
  const expectedSignalsFromRules = useMemo(() => {
    if (!scoringConfig?.enabled) return []
    const map: Record<string, string> = {
      viagem_internacional_recente: 'viagem_internacional_recente',
      familia_ajudando: 'familia_co_financiadora',
      sinal_indireto: 'referencia_casamento_premium',
    }
    const signalKeys = new Set(signals.map(s => s.signal_key))
    const missing: Array<{ scoringDimension: string; expectedSignalKey: string; ruleLabel: string }> = []
    for (const rule of scoringRules) {
      const expected = map[rule.dimension]
      if (expected && !signalKeys.has(expected)) {
        missing.push({
          scoringDimension: rule.dimension,
          expectedSignalKey: expected,
          ruleLabel: rule.label || rule.dimension,
        })
      }
    }
    return missing
  }, [scoringConfig, scoringRules, signals])

  if (!sondagemMoment) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
        <Search className="w-6 h-6 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-600 font-medium">Nenhuma fase de Sondagem configurada</p>
        <p className="text-xs text-slate-500 mt-1">
          Pra ativar, vá em <strong>Roteiro</strong> e crie uma fase com slots de descoberta (data, destino, etc).
        </p>
      </div>
    )
  }

  const slots = sondagemMoment.discovery_config?.slots ?? []
  const requiredSlots = slots.filter(s => resolveSlotPriority(s) === 'critical')
  const preferredSlots = slots.filter(s => resolveSlotPriority(s) === 'preferred')
  const niceToHaveSlots = slots.filter(s => resolveSlotPriority(s) === 'nice_to_have')

  return (
    <div className="space-y-8">
      {/* Banner explicativo */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 flex gap-3">
        <Search className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-0.5">
            O que ela coleta numa conversa
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            <strong>Slots</strong> são perguntas explícitas (a agente faz). <strong>Sinais silenciosos</strong> ela
            detecta sozinha, sem perguntar. Os dois alimentam a Pontuação e decidem se o lead qualifica.
          </p>
        </div>
      </div>

      {/* Slots — perguntas explícitas */}
      <section>
        <header className="mb-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-indigo-600" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Slots da Sondagem ({slots.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dados que a agente pergunta explicitamente, na fase <strong>{sondagemMoment.moment_label}</strong>.
              Clique pra editar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerMomentId(sondagemMoment.id)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
          >
            Editar fase <ChevronRight className="w-3 h-3" />
          </button>
        </header>

        {requiredSlots.length > 0 && (
          <SlotGroup
            title="Obrigatórios"
            subtitle="Bloqueiam avanço pro Desfecho até serem preenchidos"
            tone="rose"
            slots={requiredSlots}
            onEditMoment={() => setDrawerMomentId(sondagemMoment.id)}
          />
        )}
        {preferredSlots.length > 0 && (
          <div className="mt-4">
            <SlotGroup
              title="Importantes"
              subtitle="Pergunta enquanto não bateu score; pula se já qualificou"
              tone="amber"
              slots={preferredSlots}
              onEditMoment={() => setDrawerMomentId(sondagemMoment.id)}
            />
          </div>
        )}
        {niceToHaveSlots.length > 0 && (
          <div className="mt-4">
            <SlotGroup
              title="Extras"
              subtitle="Só pergunta se a conversa fluir natural"
              tone="slate"
              slots={niceToHaveSlots}
              onEditMoment={() => setDrawerMomentId(sondagemMoment.id)}
            />
          </div>
        )}
      </section>

      {/* Cruzamento — sinais esperados pelo scoring mas ausentes */}
      {expectedSignalsFromRules.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-slate-900 mb-1">
                Sinais esperados pela Pontuação mas não configurados
              </h4>
              <p className="text-xs text-slate-600 mb-2">
                Estas regras de scoring dependem de sinais que ainda não existem como detector silencioso.
                Sem detector, a regra nunca vai disparar.
              </p>
              <ul className="space-y-1.5 text-xs">
                {expectedSignalsFromRules.map(item => (
                  <li key={item.scoringDimension} className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold mt-0.5">⚠</span>
                    <div>
                      <strong>{item.ruleLabel}</strong>{' '}
                      <span className="text-slate-500">
                        espera o sinal <code className="font-mono text-[11px] bg-white border border-amber-200 rounded px-1 py-0.5">{item.expectedSignalKey}</code>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Sinais silenciosos */}
      <section className="pt-4 border-t border-slate-100">
        <header className="mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-500" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900">
              Sinais silenciosos ({signals.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              O que ela observa e anota sem comentar com o cliente.
            </p>
          </div>
        </header>
        <SilentSignalsSection agentId={agentId} agentName={agentName} companyName={companyName} />
      </section>

      <MomentDrawer
        agentId={agentId}
        agentName={agentName}
        companyName={companyName}
        moment={drawerMoment}
        open={!!drawerMomentId}
        onOpenChange={(open) => { if (!open) setDrawerMomentId(null) }}
      />
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

function SlotGroup({
  title, subtitle, tone, slots, onEditMoment,
}: {
  title: string
  subtitle: string
  tone: 'rose' | 'amber' | 'slate'
  slots: NonNullable<PlaybookMoment['discovery_config']>['slots']
  onEditMoment: () => void
}) {
  const labelClass = {
    rose: 'bg-rose-100 text-rose-700 border-rose-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }[tone]

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide ${labelClass}`}>
          {title}
        </span>
        <span className="text-[11px] text-slate-500">{subtitle}</span>
      </div>
      <div className="space-y-2">
        {slots.map(slot => {
          const hasQuestion = (slot.questions ?? []).some(q => q.trim().length > 0)
          return (
            <button
              key={slot.key}
              type="button"
              onClick={onEditMoment}
              className="group w-full text-left bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                {slot.icon && (
                  <span className="text-lg flex-shrink-0">{slot.icon}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h5 className="text-sm font-semibold text-slate-900 truncate">{slot.label || slot.key}</h5>
                    {!hasQuestion && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 font-medium inline-flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        sem pergunta
                      </span>
                    )}
                  </div>
                  {hasQuestion ? (
                    <p className="text-xs text-slate-600 italic line-clamp-2">"{slot.questions[0]}"</p>
                  ) : (
                    <p className="text-xs text-slate-500">A IA vai improvisar a pergunta. Clique pra escrever uma versão calibrada.</p>
                  )}
                  {slot.crm_field_key && (
                    <div className="mt-1.5">
                      <code className="text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                        {slot.crm_field_key}
                      </code>
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 mt-1.5 flex-shrink-0" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
