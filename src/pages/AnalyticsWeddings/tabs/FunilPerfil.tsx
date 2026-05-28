import { useState } from 'react'
import { useFilterParams } from '../components/FilterBar'
import { useWwFunilConversao, type WwFunilConversaoData, type WwFunilMarcos } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { formatNumber } from '../lib/format'
import { formatRange } from '../lib/dates'

// Lista canônica de convidados (mesmas categorias que _ww2_norm_conv_strict produz).
// Faixa e Destino vêm da FilterBar global no topo da página.
const CONVIDADOS_OPTIONS = ['Apenas o casal', 'Até 20', '20-50', '50-80', '80-100', '+100']

type MarcoKey = keyof WwFunilMarcos
const MARCOS: { key: MarcoKey; label: string; short: string; icon: string }[] = [
  { key: 'entrou',        label: '1. Entrou',                 short: 'Entrou',         icon: '📥' },
  { key: 'marcou_sdr',    label: '2. Agendou reunião SDR',    short: 'Agendou SDR',    icon: '📅' },
  { key: 'fez_sdr',       label: '3. Fez reunião SDR',        short: 'Fez SDR',        icon: '✅' },
  { key: 'marcou_closer', label: '4. Agendou reunião Closer', short: 'Agendou Closer', icon: '📅' },
  { key: 'fez_closer',    label: '5. Fez reunião Closer',     short: 'Fez Closer',     icon: '✅' },
  { key: 'ganho',         label: '6. Virou ganho',            short: 'Ganho',          icon: '🏆' },
]

export function FunilPerfil() {
  const filters = useFilterParams()
  const [convidados, setConvidados] = useState<string[]>([])
  const [drill, setDrill] = useState<DrillContext | null>(null)

  const { data, isLoading, error } = useWwFunilConversao({
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    dateMode: filters.dateMode,
    faixas: filters.faixas,
    destinos: filters.destinos,
    convidados,
    origins: filters.origins,
    tipos: filters.tipos,
    consultorIds: filters.consultorIds,
  })

  if (isLoading) return <LoadingSkeleton rows={8} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const temFiltro = data.tem_filtro_preenchimento

  return (
    <div className="space-y-5">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
        <div className="flex items-start gap-3">
          <span className="text-emerald-600 text-lg">✨</span>
          <div className="flex-1">
            <p className="font-medium">"Ganho" agora reflete o universo real do AC</p>
            <p className="text-emerald-700 text-xs mt-1">
              Etapas 1-5 (Entrou → SDR → Closer) continuam vindo do CRM.
              Etapa 6 "Ganho" usa cache AC + heurísticas legadas — captura casamentos fechados que o CRM perdeu.
              Universo de referência: 150 casamentos no AC (mesma lógica do <a href="https://weddings-kpi.vercel.app/" target="_blank" rel="noreferrer" className="underline">weddings-kpi</a>).
            </p>
          </div>
        </div>
      </div>

      <Header data={data} />

      <FiltroConvidados selected={convidados} onChange={setConvidados} />

      {data.filtrado_total === 0 && temFiltro ? (
        <SectionCard title="Sem leads com esse perfil" subtitle="Os filtros aplicados não retornaram nenhum lead. Reduza os filtros para ver dados.">
          <EmptyState message="Tente remover algum filtro de preenchimento (faixa, convidados ou destino)." />
        </SectionCard>
      ) : (
        <>
          {temFiltro && data.filtrado_total < 10 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <strong>⚠️ Amostra pequena:</strong> apenas {data.filtrado_total} leads correspondem ao filtro. Os percentuais podem oscilar muito. Considere expandir para ter mais segurança nos números.
            </div>
          )}

          <FunilLadoALado
            data={data}
            onDrill={(marco, lado) => {
              const titulo = lado === 'filtrado' ? `Filtrado · ${MARCOS.find(m => m.key === marco)?.label}` : `Baseline · ${MARCOS.find(m => m.key === marco)?.label}`
              const ctx: DrillContext = {
                dateStart: filters.dateStart,
                dateEnd: filters.dateEnd,
                title: titulo,
                subtitle: marco === 'ganho' ? 'Leads marcados como ganho (status_comercial ou ww_closer_data_ganho).' : undefined,
              }
              if (marco === 'ganho') ctx.status = 'ganho'
              if (lado === 'filtrado') {
                if (filters.faixas[0]) ctx.faixa = filters.faixas[0]
                if (filters.destinos[0]) ctx.destino = filters.destinos[0]
              }
              setDrill(ctx)
            }}
          />

          <TabelaConversao data={data} />

          {temFiltro && <DiagnosticoLift data={data} />}
        </>
      )}

      <FonteEFontesNota />

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function Header({ data }: { data: WwFunilConversaoData }) {
  const acStatus = data.ac_sync.status
  const acColor =
    acStatus === 'recent' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
    acStatus === 'stale'  ? 'bg-amber-50 border-amber-200 text-amber-800' :
    acStatus === 'very_stale' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                                 'bg-slate-50 border-slate-200 text-slate-700'
  const acText =
    acStatus === 'recent' ? `ActiveCampaign · sincronizado há ${formatMin(data.ac_sync.minutes_ago)}` :
    acStatus === 'stale'  ? `ActiveCampaign · ${formatMin(data.ac_sync.minutes_ago)} sem atualização` :
    acStatus === 'very_stale' ? `ActiveCampaign · ${formatMin(data.ac_sync.minutes_ago)} sem atualização — pode estar defasado` :
                                 'ActiveCampaign · sem eventos recentes'

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
      <h2 className="text-base font-semibold text-slate-900">📈 Funil por perfil de lead</h2>
      <p className="text-sm text-slate-600 mt-1.5">
        Compara o funil de um grupo filtrado (por <strong>investimento, convidados, destino</strong>) com a média de todo o período.
        Mostra quantos leads chegam a cada marco — entrou, agendou SDR, fez SDR, agendou Closer, fez Closer, virou ganho.
        Os marcos são lidos do <strong>ActiveCampaign</strong> (sincronizado em tempo real para o CRM).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-700">
          📆 Período: <strong>{formatRange(data.periodo.date_start, data.periodo.date_end)}</strong>
        </span>
        <span className="px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-700">
          📊 Modo: <strong>{data.periodo.date_mode === 'cohort' ? 'Leads que entraram (cohort)' : 'Atividade no período (throughput)'}</strong>
        </span>
        <span className={`px-2 py-1 border rounded-md ${acColor}`}>{acText}</span>
      </div>
    </div>
  )
}

function formatMin(mins: number | null | undefined): string {
  if (mins == null) return '?'
  if (mins < 1) return 'menos de 1min'
  if (mins < 60) return `${Math.round(mins)}min`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  return `${d}d`
}

function FiltroConvidados({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <SectionCard
      title="👥 Filtro adicional — Convidados declarados"
      subtitle="A FilterBar do topo já tem 💰 Faixa e 🏝️ Destino. Aqui você adiciona o filtro de Convidados. Combinações são AND entre dimensões, OR dentro da mesma."
    >
      <div className="flex flex-wrap gap-1.5">
        {CONVIDADOS_OPTIONS.map(opt => {
          const isSel = selected.includes(opt)
          return (
            <button
              key={opt}
              onClick={() => onChange(isSel ? selected.filter(o => o !== opt) : [...selected, opt])}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                isSel
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {opt}
            </button>
          )
        })}
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="px-2 py-1.5 text-xs text-slate-500 hover:text-rose-600 ml-1"
          >
            ✕ limpar
          </button>
        )}
      </div>
    </SectionCard>
  )
}

function FunilLadoALado({
  data,
  onDrill,
}: {
  data: WwFunilConversaoData
  onDrill: (marco: MarcoKey, lado: 'filtrado' | 'baseline') => void
}) {
  const temFiltro = data.tem_filtro_preenchimento
  const totalFiltrado = data.filtrado_total
  const totalBaseline = data.baseline_total

  return (
    <SectionCard
      title="🎯 Funil comparado"
      subtitle={temFiltro
        ? 'À esquerda os leads que se encaixam no filtro; à direita todos os leads do período. Compare onde o filtro converte melhor ou pior.'
        : 'Sem filtros aplicados, ambos os lados mostram a mesma coisa. Selecione faixa, convidados ou destino acima para começar a comparar.'}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FunilLado
          titulo={temFiltro ? '🔍 FILTRADO' : '📊 Funil'}
          subtitulo={temFiltro ? 'Leads que se encaixam no filtro' : 'Todos os leads do período'}
          accent="indigo"
          marcos={data.filtrado}
          total={totalFiltrado}
          baselineTotal={totalBaseline}
          temFiltro={temFiltro}
          onMarcoClick={(m) => onDrill(m, 'filtrado')}
        />
        <FunilLado
          titulo="📊 BASELINE"
          subtitulo="Todos os leads do período (sem filtro de preenchimento)"
          accent="slate"
          marcos={data.baseline}
          total={totalBaseline}
          baselineTotal={totalBaseline}
          temFiltro={false}
          dimmed={!temFiltro}
          onMarcoClick={(m) => onDrill(m, 'baseline')}
        />
      </div>
    </SectionCard>
  )
}

function FunilLado({
  titulo, subtitulo, accent, marcos, total, baselineTotal, temFiltro, dimmed, onMarcoClick,
}: {
  titulo: string
  subtitulo: string
  accent: 'indigo' | 'slate'
  marcos: WwFunilMarcos
  total: number
  baselineTotal: number
  temFiltro: boolean
  dimmed?: boolean
  onMarcoClick: (m: MarcoKey) => void
}) {
  const txtAccent = accent === 'indigo' ? 'text-indigo-700' : 'text-slate-700'
  const bgAccent = accent === 'indigo' ? 'bg-indigo-500' : 'bg-slate-400'
  const headerBg = accent === 'indigo' ? 'bg-indigo-50/60 border-indigo-200' : 'bg-slate-50 border-slate-200'

  const taxaConversao = total > 0 ? (marcos.ganho / total) * 100 : 0
  const taxaBaseline = baselineTotal > 0 ? (marcos.ganho / baselineTotal) * 100 : 0
  const portion = temFiltro && baselineTotal > 0 ? (total / baselineTotal) * 100 : 100

  return (
    <div className={`border ${dimmed ? 'opacity-60' : ''} rounded-lg overflow-hidden ${headerBg}`}>
      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <div className={`text-xs font-semibold uppercase tracking-wide ${txtAccent}`}>{titulo}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{subtitulo}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-slate-900 tabular-nums">{formatNumber(total)}</span>
          <span className="text-xs text-slate-500">leads</span>
          {temFiltro && (
            <span className="text-[11px] text-slate-400 ml-1">({portion.toFixed(1)}% do total)</span>
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-2 text-xs">
          <span className="text-slate-500">Conversão final:</span>
          <span className={`font-semibold tabular-nums ${txtAccent}`}>{taxaConversao.toFixed(1)}%</span>
          {temFiltro && (
            <span className="text-[11px] text-slate-400">vs {taxaBaseline.toFixed(1)}% baseline</span>
          )}
        </div>
      </div>
      <div className="bg-white p-4 space-y-2">
        {MARCOS.map((marco, i) => {
          const value = marcos[marco.key]
          const pctTotal = total > 0 ? (value / total) * 100 : 0
          const prevValue = i > 0 ? marcos[MARCOS[i - 1].key] : value
          const pctAnterior = prevValue > 0 ? (value / prevValue) * 100 : 0
          const barWidth = pctTotal
          return (
            <button
              key={marco.key}
              onClick={() => onMarcoClick(marco.key)}
              className="w-full text-left p-2.5 rounded-lg hover:bg-slate-50 transition group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{marco.icon}</span>
                  <span className="text-xs font-medium text-slate-700">{marco.short}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatNumber(value)}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums w-12 text-right">{pctTotal.toFixed(1)}%</span>
                </div>
              </div>
              <div className="relative h-2 bg-slate-100 rounded-sm overflow-hidden">
                <div className={`absolute top-0 left-0 h-full ${bgAccent} transition-all`} style={{ width: `${barWidth}%` }} />
              </div>
              {i > 0 && (
                <div className="mt-1 text-[10px] text-slate-400">
                  {pctAnterior.toFixed(1)}% chegaram do passo anterior
                  {prevValue > 0 && value < prevValue && (
                    <span className="text-rose-500 ml-1">· perdeu {formatNumber(prevValue - value)} leads</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TabelaConversao({ data }: { data: WwFunilConversaoData }) {
  const temFiltro = data.tem_filtro_preenchimento
  const linhas: { marco: string; icon: string; f_qtd: number; f_pct: number; b_qtd: number; b_pct: number; lift: number | null }[] = []

  for (let i = 0; i < MARCOS.length; i++) {
    const m = MARCOS[i]
    const f_qtd = data.filtrado[m.key]
    const b_qtd = data.baseline[m.key]
    const prev_f = i > 0 ? data.filtrado[MARCOS[i - 1].key] : f_qtd
    const prev_b = i > 0 ? data.baseline[MARCOS[i - 1].key] : b_qtd
    const f_pct = prev_f > 0 ? (f_qtd / prev_f) * 100 : 0
    const b_pct = prev_b > 0 ? (b_qtd / prev_b) * 100 : 0
    const lift = i === 0 ? null : (b_pct > 0 ? f_pct / b_pct : null)
    linhas.push({ marco: m.short, icon: m.icon, f_qtd, f_pct, b_qtd, b_pct, lift })
  }

  return (
    <SectionCard
      title="📉 Quem cai onde — taxas de passagem entre marcos"
      subtitle="Em cada linha, % é quantos do marco anterior chegaram aqui. Quando filtrado > baseline, esse grupo passa melhor por esse marco."
    >
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <div className="grid grid-cols-12 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-medium tracking-wide text-slate-500">
          <div className="col-span-3">Marco</div>
          <div className="col-span-3 text-right">{temFiltro ? 'Filtrado' : 'Funil'}</div>
          <div className="col-span-3 text-right">Baseline</div>
          <div className="col-span-3 text-right">{temFiltro ? 'Lift' : ''}</div>
        </div>
        <div className="divide-y divide-slate-100">
          {linhas.map((l, idx) => (
            <div key={l.marco} className="grid grid-cols-12 items-center px-3 py-2.5 text-xs">
              <div className="col-span-3 flex items-center gap-2">
                <span>{l.icon}</span>
                <span className="font-medium text-slate-900">{l.marco}</span>
              </div>
              <div className="col-span-3 text-right">
                <span className="font-semibold text-indigo-700 tabular-nums">{formatNumber(l.f_qtd)}</span>
                {idx > 0 && <span className="text-[11px] text-slate-400 ml-1">({l.f_pct.toFixed(1)}%)</span>}
              </div>
              <div className="col-span-3 text-right">
                <span className="font-semibold text-slate-700 tabular-nums">{formatNumber(l.b_qtd)}</span>
                {idx > 0 && <span className="text-[11px] text-slate-400 ml-1">({l.b_pct.toFixed(1)}%)</span>}
              </div>
              <div className="col-span-3 text-right">
                {idx > 0 && l.lift != null && temFiltro && <LiftCell lift={l.lift} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

function LiftCell({ lift }: { lift: number }) {
  const lower = lift < 0.9
  const higher = lift > 1.1
  const cls = higher ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : lower  ? 'bg-rose-50 text-rose-700 border-rose-200'
                     : 'bg-slate-50 text-slate-600 border-slate-200'
  const sign = higher ? '↑' : lower ? '↓' : '='
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${cls}`}>
      {sign} {lift.toFixed(2)}x
    </span>
  )
}

function DiagnosticoLift({ data }: { data: WwFunilConversaoData }) {
  const totalF = data.filtrado_total
  const totalB = data.baseline_total
  const ganhoF = data.filtrado.ganho
  const ganhoB = data.baseline.ganho
  const taxaF = totalF > 0 ? (ganhoF / totalF) * 100 : 0
  const taxaB = totalB > 0 ? (ganhoB / totalB) * 100 : 0
  const lift = taxaB > 0 ? taxaF / taxaB : null

  let veredito = ''
  let cor = 'slate'
  if (lift != null) {
    if (lift >= 1.5) { veredito = 'Esse perfil converte MUITO MELHOR que a média.'; cor = 'emerald' }
    else if (lift >= 1.15) { veredito = 'Esse perfil converte um pouco MELHOR que a média.'; cor = 'emerald' }
    else if (lift >= 0.85) { veredito = 'Esse perfil converte de forma SEMELHANTE à média.'; cor = 'slate' }
    else if (lift >= 0.5) { veredito = 'Esse perfil converte PIOR que a média.'; cor = 'rose' }
    else { veredito = 'Esse perfil converte MUITO PIOR que a média.'; cor = 'rose' }
  }

  // Identificar o pior gargalo (maior queda no filtrado vs baseline)
  let piorGargalo: { marco: string; queda_f: number; queda_b: number; delta: number } | null = null
  for (let i = 1; i < MARCOS.length; i++) {
    const m = MARCOS[i]
    const prev = MARCOS[i - 1]
    const f_now = data.filtrado[m.key], f_prev = data.filtrado[prev.key]
    const b_now = data.baseline[m.key], b_prev = data.baseline[prev.key]
    const queda_f = f_prev > 0 ? 1 - (f_now / f_prev) : 0
    const queda_b = b_prev > 0 ? 1 - (b_now / b_prev) : 0
    const delta = queda_f - queda_b
    if (!piorGargalo || delta > piorGargalo.delta) {
      piorGargalo = { marco: `${prev.short} → ${m.short}`, queda_f, queda_b, delta }
    }
  }

  const corBg = cor === 'emerald' ? 'bg-emerald-50 border-emerald-200' : cor === 'rose' ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'
  const corTxt = cor === 'emerald' ? 'text-emerald-900' : cor === 'rose' ? 'text-rose-900' : 'text-slate-700'

  return (
    <SectionCard title="💡 Diagnóstico" subtitle="Comparação rápida entre o filtro e a média.">
      <div className={`border rounded-lg p-4 ${corBg}`}>
        <div className={`text-sm font-medium ${corTxt}`}>{veredito}</div>
        <div className="mt-2 text-xs text-slate-700">
          Filtrado fecha <strong>{taxaF.toFixed(1)}%</strong> ({formatNumber(ganhoF)} de {formatNumber(totalF)} leads).
          Baseline fecha <strong>{taxaB.toFixed(1)}%</strong> ({formatNumber(ganhoB)} de {formatNumber(totalB)} leads).
          {lift != null && <span> Lift = <strong>{lift.toFixed(2)}x</strong>.</span>}
        </div>
        {piorGargalo && piorGargalo.delta > 0.1 && (
          <div className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
            <strong>⚠️ Gargalo específico do filtro:</strong> entre <strong>{piorGargalo.marco}</strong> o filtrado perde <strong>{(piorGargalo.queda_f * 100).toFixed(1)}%</strong> dos leads, enquanto a média perde só <strong>{(piorGargalo.queda_b * 100).toFixed(1)}%</strong>. É aqui que esse perfil cai mais que deveria.
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function FonteEFontesNota() {
  return (
    <div className="text-xs text-slate-500 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="font-medium text-slate-700 mb-1.5">🔍 De onde vem cada número</div>
      <ul className="space-y-1 ml-1">
        <li>• <strong>Entrou:</strong> cards criados no período (cohort) ou com atividade no período (throughput).</li>
        <li>• <strong>Agendou SDR:</strong> SDR preencheu data da reunião no AC (campo <code className="text-[10px] bg-white px-1">ww_sdr_data_reuniao</code>).</li>
        <li>• <strong>Fez SDR:</strong> SDR marcou qualificação no AC, OU o lead avançou para Closer/Pós-venda.</li>
        <li>• <strong>Agendou Closer:</strong> Closer preencheu data da reunião no AC (<code className="text-[10px] bg-white px-1">ww_closer_data_reuniao</code>), OU o lead já está em Closer/Pós-venda.</li>
        <li>• <strong>Fez Closer:</strong> lead avançou além de "Reunião Agendada" no Closer (Apresentação Feita / Proposta / Negociação / Contrato Assinado), OU está em Pós-venda, OU virou ganho.</li>
        <li>• <strong>Ganho:</strong> card com <code className="text-[10px] bg-white px-1">status_comercial='ganho'</code> OU com <code className="text-[10px] bg-white px-1">ww_closer_data_ganho</code> preenchido no AC.</li>
      </ul>
      <div className="mt-2 text-[11px] text-slate-400">
        Lógica <strong>inclusiva</strong>: se o lead já passou do marco, conta como tendo passado, mesmo que tenha pulado o stage no CRM. Isso evita subcontar leads que avançaram rápido no funil.
      </div>
    </div>
  )
}
