import type { WwDiretoriaTempos, WwDwellFase, WwAgingFase, WwTempoLeg } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState } from './ui'
import { FASE_UI } from './diretoriaColors'

const AMOSTRA_MIN = 8 // abaixo disso a mediana não é confiável → "dados insuficientes"
const OPERACIONAL = new Set(['sdr', 'closer'])
const fmtDias = (n: number | null | undefined) => (n == null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(1)}d`)

export function DiretoriaTempos({ tempos, onSelectCard }: { tempos: WwDiretoriaTempos; onSelectCard: (cardId: string) => void }) {
  const { velocidade, dwell, aging } = tempos
  // SDR/Closer = tempo de travessia da operação; Planejamento/Produção = ocupação atual.
  const dwellOp = dwell.filter((d) => OPERACIONAL.has(d.key))
  const agingOp = aging.filter((a) => OPERACIONAL.has(a.key))
  const posVenda = aging.filter((a) => !OPERACIONAL.has(a.key))

  return (
    <div className="space-y-5">
      <KpiVelocidade tempos={tempos} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Tempo de travessia · SDR e Closer" subtitle="Mediana e dispersão (p25–p90) do tempo até passar pela fase, por coorte de entrada do lead no período.">
          <DwellRangeBars dwell={dwellOp} />
        </SectionCard>
        <SectionCard title="Onde o tempo vai até fechar" subtitle="Ciclo típico do lead até o contrato assinado, em medianas. Cobre SDR + Closer.">
          <CicloBar velocidade={velocidade} />
        </SectionCard>
      </div>
      <SectionCard title="Casais parados por fase" subtitle="Casais abertos hoje em SDR/Closer, por quanto tempo estão na operação. Quanto mais quente a cor, mais tempo parado.">
        <AgingView aging={agingOp} onSelectCard={onSelectCard} />
      </SectionCard>
      <SectionCard title="Pós-venda hoje · Planejamento e Produção" subtitle="Quantos casais estão em cada fase agora e há quanto tempo. A duração mede só quem já tem carimbo de entrada — vai preenchendo conforme os casais avançam.">
        <PosVendaView fases={posVenda} onSelectCard={onSelectCard} />
      </SectionCard>
    </div>
  )
}

// ── KPI strip ────────────────────────────────────────────────────────────────
function legValue(leg: WwTempoLeg): { value: string; sub: string } {
  if (!leg || leg.amostra < AMOSTRA_MIN || leg.mediana_dias == null) {
    return { value: '—', sub: `poucos dados (n=${leg?.amostra ?? 0})` }
  }
  return { value: fmtDias(leg.mediana_dias), sub: `mediana · n=${leg.amostra}` }
}

function KpiVelocidade({ tempos }: { tempos: WwDiretoriaTempos }) {
  const { velocidade, dwell, aging } = tempos
  const fech = velocidade.lead_para_fechamento
  // gargalo = fase OPERACIONAL (SDR/Closer) de maior mediana de dwell — pós-venda
  // fica de fora: tempo longo no pós-venda é esperado e não é gargalo de venda.
  const comDado = dwell.filter((d) => OPERACIONAL.has(d.key) && !d.sem_dados && (d.amostra ?? 0) >= AMOSTRA_MIN && (d.mediana_dias ?? 0) > 0)
  const gargalo = comDado.length ? comDado.reduce((a, b) => ((b.mediana_dias ?? 0) > (a.mediana_dias ?? 0) ? b : a)) : null
  // casais parados há +60d (só SDR + Closer)
  const parados60 = aging.filter((a) => OPERACIONAL.has(a.key)).reduce((s, a) => s + (a.buckets?.mais_60 ?? 0), 0)

  const sdr = legValue(velocidade.lead_para_sdr)
  const fechV = legValue(fech)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiTile label="Lead → 1ª reunião" value={sdr.value} sub={sdr.sub} />
      <KpiTile label="Lead → fechamento" value={fechV.value} sub={fechV.sub} />
      <KpiTile
        label="Gargalo de tempo"
        value={gargalo ? gargalo.label : '—'}
        sub={gargalo ? `mediana ${fmtDias(gargalo.mediana_dias)} na fase` : 'sem dado de tempo'}
      />
      <KpiTile
        label="Casais parados +60d"
        value={String(parados60)}
        sub="abertos em SDR/Closer"
        valueClass={parados60 > 0 ? 'text-rose-600' : 'text-ww-n700'}
      />
    </div>
  )
}

function KpiTile({ label, value, sub, trend, valueClass = 'text-ww-n700' }: { label: string; value: string; sub?: string; trend?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="bg-white border border-ww-sand rounded-xl shadow-ww-lift p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-ww-n400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
        {trend && <span className="text-xs font-medium">{trend}</span>}
      </div>
      {sub && <div className="text-[11px] text-ww-n400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Barras de tempo por fase (p25–p90 + mediana) ─────────────────────────────
function DwellRangeBars({ dwell }: { dwell: WwDwellFase[] }) {
  const escala = Math.max(1, ...dwell.map((d) => d.p90_dias ?? d.p75_dias ?? 0))
  return (
    <div className="space-y-4">
      {dwell.map((d) => {
        const ui = FASE_UI[d.key]
        const insuf = d.sem_dados || (d.amostra ?? 0) < AMOSTRA_MIN || d.mediana_dias == null
        return (
          <div key={d.key}>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${ui.dot}`} />
                <span className="text-ww-n700 font-medium">{d.label}</span>
              </span>
              {insuf ? (
                <span className="text-[11px] text-ww-n400 italic">{d.sem_dados ? 'sem carimbo de entrada' : `poucos dados (n=${d.amostra ?? 0})`}</span>
              ) : (
                <span className="text-xs text-ww-n500 tabular-nums">mediana <span className="font-semibold text-ww-n700">{fmtDias(d.mediana_dias)}</span> · n={d.amostra}</span>
              )}
            </div>
            {insuf ? (
              <div className="h-5 bg-ww-cream/60 rounded" />
            ) : (
              <RangeTrack d={d} escala={escala} bar={ui.bar} />
            )}
          </div>
        )
      })}
      <p className="text-[10px] text-ww-n400">Faixa clara = p25→p90 · faixa cheia = p25→p75 · risco = mediana.</p>
    </div>
  )
}

function RangeTrack({ d, escala, bar }: { d: WwDwellFase; escala: number; bar: string }) {
  const p25 = d.p25_dias ?? 0, p75 = d.p75_dias ?? 0, p90 = d.p90_dias ?? p75, med = d.mediana_dias ?? 0
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / escala) * 100))}%`
  const w = (a: number, b: number) => `${Math.max(0, Math.min(100, ((b - a) / escala) * 100))}%`
  return (
    <div className="relative h-5 bg-ww-cream rounded">
      <div className={`absolute top-0 bottom-0 ${bar} opacity-25 rounded`} style={{ left: pct(p25), width: w(p25, p90) }} />
      <div className={`absolute top-0 bottom-0 ${bar} opacity-80 rounded`} style={{ left: pct(p25), width: w(p25, p75) }} />
      <div className="absolute -top-0.5 -bottom-0.5 w-[2px] bg-ww-n700 rounded" style={{ left: pct(med) }} title={`mediana ${fmtDias(med)}`} />
      <span className="absolute -bottom-4 text-[10px] text-ww-n400 tabular-nums" style={{ left: pct(p90) }}>{fmtDias(p90)}</span>
    </div>
  )
}

// ── Ciclo (lead → fechamento) em segmentos ───────────────────────────────────
function CicloBar({ velocidade }: { velocidade: WwDiretoriaTempos['velocidade'] }) {
  const total = velocidade.lead_para_fechamento.mediana_dias
  const ateSdr = velocidade.lead_para_sdr.mediana_dias
  if (velocidade.lead_para_fechamento.amostra < AMOSTRA_MIN || total == null || total <= 0) {
    return <EmptyState message="Poucos fechamentos no período para montar o ciclo." />
  }
  const seg1 = Math.max(0, Math.min(ateSdr ?? 0, total))
  const seg2 = Math.max(0, total - seg1)
  const segs = [
    { label: 'Lead → 1ª reunião', dias: seg1, cls: 'bg-ww-gold' },
    { label: 'Reunião → fechamento', dias: seg2, cls: 'bg-ww-rosewood' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ww-n500">Ciclo típico</span>
        <span className="text-2xl font-semibold text-ww-n700 tabular-nums">{fmtDias(total)}</span>
      </div>
      <div className="flex h-6 w-full rounded-lg overflow-hidden">
        {segs.map((s) => (
          <div key={s.label} className={`${s.cls} h-full`} style={{ width: `${(s.dias / total) * 100}%` }} title={`${s.label}: ${fmtDias(s.dias)}`} />
        ))}
      </div>
      <div className="space-y-1.5">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-ww-n600">
              <span className={`w-2 h-2 rounded-sm ${s.cls}`} />{s.label}
            </span>
            <span className="text-ww-n700 tabular-nums">{fmtDias(s.dias)} <span className="text-ww-n400">· {Math.round((s.dias / total) * 100)}%</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Aging (casais parados) ───────────────────────────────────────────────────
const BUCKETS = [
  { key: 'ate_7'   as const, label: 'até 7d',  cls: 'bg-emerald-400' },
  { key: 'd8_30'   as const, label: '8–30d',   cls: 'bg-amber-300' },
  { key: 'd31_60'  as const, label: '31–60d',  cls: 'bg-amber-500' },
  { key: 'mais_60' as const, label: '+60d',    cls: 'bg-rose-500' },
]

function AgingView({ aging, onSelectCard }: { aging: WwAgingFase[]; onSelectCard: (cardId: string) => void }) {
  const comDado = aging.filter((a) => !a.sem_dados)
  return (
    <div className="space-y-5">
      {comDado.length === 0 ? (
        <EmptyState message="Sem casais abertos em SDR/Closer para medir." />
      ) : (
        comDado.map((a) => <AgingFaseRow key={a.key} a={a} onSelectCard={onSelectCard} />)
      )}
    </div>
  )
}

function AgingFaseRow({ a, onSelectCard }: { a: WwAgingFase; onSelectCard: (cardId: string) => void }) {
  const ui = FASE_UI[a.key]
  const total = a.buckets ? a.buckets.ate_7 + a.buckets.d8_30 + a.buckets.d31_60 + a.buckets.mais_60 : 0
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${ui.dot}`} />
          <span className="text-ww-n700 font-medium">{a.label}</span>
          <span className="text-ww-n400 text-xs">· {total} {total === 1 ? 'casal' : 'casais'}</span>
        </span>
        {a.mediana_aberto_dias != null && <span className="text-xs text-ww-n500 tabular-nums">mediana {fmtDias(a.mediana_aberto_dias)}</span>}
      </div>
      {total > 0 && a.buckets && (
        <>
          <div className="flex h-4 w-full rounded overflow-hidden mb-1.5">
            {BUCKETS.map((b) => {
              const n = a.buckets![b.key]
              return n > 0 ? <div key={b.key} className={`${b.cls} h-full`} style={{ width: `${(n / total) * 100}%` }} title={`${b.label}: ${n}`} /> : null
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
            {BUCKETS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1 text-[11px] text-ww-n500">
                <span className={`w-2 h-2 rounded-sm ${b.cls}`} />{b.label}: <span className="tabular-nums text-ww-n700">{a.buckets![b.key]}</span>
              </span>
            ))}
          </div>
        </>
      )}
      {a.top_parados.length > 0 && (
        <div className="space-y-0.5 pl-1">
          {a.top_parados.map((t) => (
            <div key={t.card_id} className="flex items-center gap-2 text-xs py-0.5">
              <button type="button" onClick={() => onSelectCard(t.card_id)} className="flex-1 min-w-0 truncate text-left text-indigo-700 hover:underline">{t.titulo}</button>
              {t.responsavel && <span className="hidden sm:inline text-ww-n400 shrink-0">{t.responsavel}</span>}
              <span className={`shrink-0 tabular-nums font-medium ${t.dias > 60 ? 'text-rose-600' : 'text-amber-600'}`}>{t.dias}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pós-venda (Planejamento · Produção): contagem + ocupação honesta ─────────
function PosVendaView({ fases, onSelectCard }: { fases: WwAgingFase[]; onSelectCard: (cardId: string) => void }) {
  const comCasais = fases.filter((f) => (f.amostra ?? 0) > 0)
  return (
    <div className="space-y-5">
      {comCasais.length === 0 ? (
        <EmptyState message="Nenhum casal em Planejamento ou Produção agora." />
      ) : (
        comCasais.map((f) => <PosVendaRow key={f.key} f={f} onSelectCard={onSelectCard} />)
      )}
      <p className="text-[10px] text-ww-n400">
        Tempo longo no pós-venda é normal (casamento é planejado com meses de antecedência). A duração começou a ser
        registrada agora — casais sem carimbo de entrada aparecem na contagem, mas ainda não na barra de tempo.
      </p>
    </div>
  )
}

function PosVendaRow({ f, onSelectCard }: { f: WwAgingFase; onSelectCard: (cardId: string) => void }) {
  const ui = FASE_UI[f.key]
  const total = f.amostra ?? 0
  const comTempo = f.com_tempo ?? 0
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${ui.dot}`} />
          <span className="text-ww-n700 font-medium">{f.label}</span>
          <span className="text-ww-n400 text-xs">· {total} {total === 1 ? 'casal' : 'casais'} agora</span>
        </span>
        {comTempo > 0 && f.mediana_aberto_dias != null && (
          <span className="text-xs text-ww-n500 tabular-nums">mediana {fmtDias(f.mediana_aberto_dias)} na fase</span>
        )}
      </div>
      {comTempo > 0 && f.buckets ? (
        <>
          <div className="flex h-4 w-full rounded overflow-hidden mb-1.5">
            {BUCKETS.map((b) => {
              const n = f.buckets![b.key]
              return n > 0 ? <div key={b.key} className={`${b.cls} h-full`} style={{ width: `${(n / comTempo) * 100}%` }} title={`${b.label}: ${n}`} /> : null
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
            {BUCKETS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1 text-[11px] text-ww-n500">
                <span className={`w-2 h-2 rounded-sm ${b.cls}`} />{b.label}: <span className="tabular-nums text-ww-n700">{f.buckets![b.key]}</span>
              </span>
            ))}
          </div>
          {comTempo < total && (
            <p className="text-[11px] text-ww-n400 mb-1.5">{comTempo} de {total} com tempo medido (o resto entrou antes do carimbo).</p>
          )}
        </>
      ) : (
        <div className="h-4 bg-ww-cream/60 rounded mb-1.5" />
      )}
      {f.top_parados.length > 0 && (
        <div className="space-y-0.5 pl-1">
          {f.top_parados.map((t) => (
            <div key={t.card_id} className="flex items-center gap-2 text-xs py-0.5">
              <button type="button" onClick={() => onSelectCard(t.card_id)} className="flex-1 min-w-0 truncate text-left text-indigo-700 hover:underline">{t.titulo}</button>
              {t.responsavel && <span className="hidden sm:inline text-ww-n400 shrink-0">{t.responsavel}</span>}
              <span className="shrink-0 tabular-nums font-medium text-ww-n500">{t.dias}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
