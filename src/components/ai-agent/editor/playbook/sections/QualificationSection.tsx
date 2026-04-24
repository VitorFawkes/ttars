import { useAgentScoring } from '@/hooks/useAgentScoring'
import { ExternalLink, Info } from 'lucide-react'

interface Props {
  agentId: string
}

/**
 * QualificationSection — wrapper que aponta pro editor de Pontuação existente.
 *
 * O v2 reusa a infra de scoring (ai_agent_scoring_rules + scoring_config) que
 * já está em produção com 14 regras da Estela. O Marco 2a estendeu com rule_type
 * (qualify/disqualify/bonus) e a RPC já respeita.
 *
 * Visual minimalista pra quem já tem scoring editado em TabPontuacao. No v2.1,
 * um construtor visual dedicado virá pra unificar aqui (ver plano master).
 */
export function QualificationSection({ agentId }: Props) {
  const { rules, config, isLoading } = useAgentScoring(agentId)

  if (isLoading) return <div className="py-8 text-center text-slate-400">Carregando...</div>

  const total = rules.length
  const qualify = rules.filter(r => (r as unknown as { rule_type?: string }).rule_type === 'qualify' || !(r as unknown as { rule_type?: string }).rule_type).length
  const bonus = rules.filter(r => (r as unknown as { rule_type?: string }).rule_type === 'bonus').length
  const disqualify = rules.filter(r => (r as unknown as { rule_type?: string }).rule_type === 'disqualify').length

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-50 border border-indigo-100 text-sm">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
        <div className="text-indigo-900">
          <p className="font-medium">Qualificação usa o sistema de Pontuação.</p>
          <p className="text-xs mt-1 text-indigo-700">
            Critérios, pesos e threshold são configurados na aba <strong>Pontuação</strong> existente.
            O Modo Playbook reaproveita essas regras e as injeta no prompt como bloco
            <code className="bg-indigo-100 px-1 rounded">&lt;qualification&gt;</code>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBox label="Regras no total" value={total} />
        <StatBox label="Qualifica (somam)" value={qualify} color="emerald" />
        <StatBox label="Bônus (com teto)" value={bonus} color="indigo" />
        <StatBox label="Desqualifica" value={disqualify} color="rose" />
      </div>

      {config && (
        <div className="text-sm text-slate-600 p-3 rounded-lg border border-slate-200 bg-slate-50">
          <div className="flex justify-between">
            <span>Score mínimo pra qualificar:</span>
            <strong className="text-slate-900">{config.threshold_qualify}</strong>
          </div>
          <div className="flex justify-between mt-1">
            <span>Scoring habilitado:</span>
            <strong className="text-slate-900">{config.enabled ? 'Sim' : 'Não'}</strong>
          </div>
          <div className="flex justify-between mt-1">
            <span>Ação se não qualificar:</span>
            <strong className="text-slate-900">{config.fallback_action}</strong>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500 flex items-center gap-1.5">
        <ExternalLink className="w-3 h-3" />
        Pra editar, vá pra aba <strong>Pontuação</strong> do agente.
      </div>
    </div>
  )
}

function StatBox({ label, value, color = 'slate' }: { label: string; value: number; color?: 'slate' | 'emerald' | 'indigo' | 'rose' }) {
  const colors = {
    slate: 'bg-slate-50 border-slate-200 text-slate-900',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-900',
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-900',
    rose: 'bg-rose-50 border-rose-100 text-rose-900',
  }
  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs mt-0.5 opacity-80">{label}</div>
    </div>
  )
}
