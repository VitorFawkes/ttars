import { useWw2Journey } from '@/hooks/analyticsWeddings/useWw2'
import { useFilterParams } from '../components/FilterBar'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { formatCurrency, formatNumber } from '../lib/format'
import { Link } from 'react-router-dom'

export function Jornada() {
  const filters = useFilterParams()
  const { data, isLoading, error } = useWw2Journey(filters)

  if (isLoading) return <LoadingSkeleton rows={6} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data) return <EmptyState message="Sem dados" />

  const { funil_real, tempos, orcamento_real, destino_mudou, ranking_lentos, dados_fechamento } = data

  return (
    <div className="space-y-5">
      {/* === Funil real verificável === */}
      <SectionCard
        title="Funil real do lead — passos verificáveis"
        subtitle="Diferente do funil por etapa, este conta APENAS leads que efetivamente cumpriram cada passo (campo preenchido ou fase alcançada)"
      >
        <div className="space-y-2">
          {funil_real.map((p) => {
            const pctWidth = p.pct_total
            const dropoff = p.pct_anterior !== null && p.pct_anterior < 90 && p.ordem > 1
            return (
              <div key={p.ordem} className="flex items-center gap-3">
                <div className="w-56 text-sm font-medium text-slate-700">{p.passo}</div>
                <div className="flex-1 bg-slate-100 h-9 rounded-lg relative overflow-hidden">
                  <div
                    className={`h-full rounded-lg transition-all flex items-center px-3 ${
                      p.ordem === 1 ? 'bg-indigo-600' :
                      p.ordem === funil_real.length ? 'bg-emerald-600' :
                      'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.max(pctWidth, 2)}%` }}
                  >
                    <span className="text-xs text-white font-semibold tabular-nums whitespace-nowrap">
                      {formatNumber(p.cards)}
                    </span>
                  </div>
                </div>
                <div className="w-28 text-right">
                  <div className="text-sm font-medium text-slate-900 tabular-nums">{p.pct_total}%</div>
                  {p.pct_anterior !== null && (
                    <div className={`text-[11px] tabular-nums ${dropoff ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>
                      {p.pct_anterior > 100 ? '—' : `${p.pct_anterior}% do passo anterior`}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-xs text-slate-400 leading-relaxed">
          <strong>Como cada passo é detectado:</strong> Marcou reunião SDR = campo "Data 1ª reunião SDR" preenchido · Fez reunião = campo de qualificação SDR preenchido · Marcou Closer = campo "Data reunião Closer" preenchido · Pagou taxa = campo "Pagamento de Taxa" = Sim · Fechou contrato = lead está em fase Pós-Venda OU status=ganho.
        </p>
      </SectionCard>

      {/* === Tempos do ciclo === */}
      <SectionCard
        title="Tempos do ciclo de venda"
        subtitle="Mediana = tempo do lead 'típico'. p75 = corte onde 75% já foram. Diferença grande indica leads outliers (uns rápidos, uns lentos)."
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <TempoCard
            label="Lead → 1ª reunião SDR"
            mediana={tempos.lead_para_reuniao_sdr.mediana_dias}
            p75={tempos.lead_para_reuniao_sdr.p75_dias}
            amostra={tempos.lead_para_reuniao_sdr.amostra}
          />
          <TempoCard
            label="Reunião SDR → Reunião Closer"
            mediana={tempos.reuniao_sdr_para_reuniao_closer.mediana_dias}
            p75={tempos.reuniao_sdr_para_reuniao_closer.p75_dias}
            amostra={tempos.reuniao_sdr_para_reuniao_closer.amostra}
          />
          <TempoCard
            label="Lead → 1ª reunião Closer"
            mediana={tempos.lead_para_closer.mediana_dias}
            p75={tempos.lead_para_closer.p75_dias}
            amostra={tempos.lead_para_closer.amostra}
          />
          <TempoCard
            label="Lead → fechamento*"
            mediana={tempos.lead_para_fechamento.mediana_dias}
            p75={tempos.lead_para_fechamento.p75_dias}
            amostra={tempos.lead_para_fechamento.amostra}
            hint="* idade do card que fechou (proxy de ciclo total)"
          />
        </div>
      </SectionCard>

      {/* === Dados de fechamento === */}
      {dados_fechamento && dados_fechamento.cards_com_dados_fechamento > 0 && (
        <SectionCard
          title="📋 Dados de fechamento (preenchidos pelo Closer no AC)"
          subtitle={`${dados_fechamento.cards_com_dados_fechamento} cards têm pelo menos 1 campo de fechamento preenchido`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-lg p-3">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Valor do pacote</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{formatCurrency(dados_fechamento.valor_pacote_mediano ?? 0)}</div>
              <div className="text-[11px] text-slate-500">mediano (de {dados_fechamento.cards_com_valor_pacote} pacotes)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">médio: {formatCurrency(dados_fechamento.valor_pacote_medio ?? 0)}</div>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-lg p-3">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Grupo WhatsApp criado</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{formatNumber(dados_fechamento.grupo_whats_sim)}<span className="text-sm font-normal text-slate-500 ml-1">de {formatNumber(dados_fechamento.grupo_whats_sim + dados_fechamento.grupo_whats_nao)}</span></div>
              <div className="text-[11px] text-emerald-600 font-medium">
                {dados_fechamento.grupo_whats_sim + dados_fechamento.grupo_whats_nao > 0
                  ? `${Math.round(100 * dados_fechamento.grupo_whats_sim / (dados_fechamento.grupo_whats_sim + dados_fechamento.grupo_whats_nao))}% criam grupo`
                  : '—'}
              </div>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-100 rounded-lg p-3">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Cerimonial incluso</div>
              <div className="mt-1 text-xs space-y-0.5">
                {(dados_fechamento.cerimonial_top ?? []).slice(0, 4).map(c => (
                  <div key={c.qtd_cerimonialista} className="flex justify-between">
                    <span className="text-slate-700">{c.qtd_cerimonialista}</span>
                    <span className="font-medium tabular-nums">{c.cards}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-lg p-3">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Prazo de contrato</div>
              <div className="mt-1 text-xs space-y-0.5">
                {(dados_fechamento.prazo_contrato_top ?? []).slice(0, 4).map(p => (
                  <div key={p.prazo} className="flex justify-between">
                    <span className="text-slate-700">{p.prazo}</span>
                    <span className="font-medium tabular-nums">{p.cards}</span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-slate-400 mt-2">{dados_fechamento.cards_com_monde_venda} com nº venda Monde</div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* === Entrada × Realidade — Orçamento === */}
      <SectionCard
        title="💰 Entrada × Realidade — Orçamento"
        subtitle="Faixa que o lead disse no formulário do site × valor REAL do pacote Welcome contratado (campo AC 'Pacote WW')"
      >
        {orcamento_real.length === 0 ? <EmptyState message="Sem dados" /> : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 font-medium">Faixa no site (entrada)</th>
                <th className="py-2 font-medium text-right">Leads</th>
                <th className="py-2 font-medium text-right">Fecharam</th>
                <th className="py-2 font-medium text-right">Taxa</th>
                <th className="py-2 font-medium text-right">C/ valor real</th>
                <th className="py-2 font-medium text-right">Mediano fechado</th>
                <th className="py-2 font-medium text-right">Médio fechado</th>
              </tr>
            </thead>
            <tbody>
              {orcamento_real.map((r) => (
                <tr key={r.faixa_entrada} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{r.faixa_entrada}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(r.leads_total)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">{formatNumber(r.leads_fechados)}</td>
                  <td className="py-2 text-right">
                    <span className={`text-[11px] font-medium tabular-nums ${r.taxa_fechamento >= 10 ? 'text-emerald-700' : r.taxa_fechamento >= 3 ? 'text-amber-700' : 'text-slate-500'}`}>
                      {r.taxa_fechamento}%
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{formatNumber(r.leads_com_valor)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{r.valor_mediano_real > 0 ? formatCurrency(r.valor_mediano_real) : <span className="text-slate-300">—</span>}</td>
                  <td className="py-2 text-right tabular-nums">{r.valor_medio_real > 0 ? formatCurrency(r.valor_medio_real) : <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded p-2">
          <strong>Lendo a tabela:</strong> "Mediano" é o valor que metade dos pacotes cobra. Note que o pacote Welcome cobre só assessoria/planejamento — o valor total que o casal investe no casamento (hotel, comida, decoração) é maior. Ainda assim, dá pra ver: quem disse "R$200-500 mil" no formulário fecha pacote Welcome de R$100 mil em mediana (~30% do declarado).
        </p>
      </SectionCard>

      {/* === Entrada × Realidade — Destino === */}
      <SectionCard
        title="🏝️ Entrada × Realidade — Destino"
        subtitle="O destino que o lead disse no formulário × onde ele REALMENTE casou (campo 'Destino' confirmado pelo time)"
      >
        {destino_mudou.length === 0 ? <EmptyState message="Sem dados" /> : (
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 font-medium">Disse no site</th>
                <th className="py-2 font-medium text-right">Leads</th>
                <th className="py-2 font-medium text-right">Manteve</th>
                <th className="py-2 font-medium text-right">Mudou</th>
                <th className="py-2 font-medium text-right">Sem dado final</th>
                <th className="py-2 font-medium text-right">% Manteve</th>
                <th className="py-2 font-medium">Mais comum no final</th>
              </tr>
            </thead>
            <tbody>
              {destino_mudou.map((r) => (
                <tr key={r.destino_entrada} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{r.destino_entrada}</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(r.leads_total)}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">{formatNumber(r.manteve)}</td>
                  <td className="py-2 text-right tabular-nums text-amber-600">{formatNumber(r.mudou)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-400">{formatNumber(r.sem_dado_final)}</td>
                  <td className="py-2 text-right">
                    {r.pct_manteve !== null ? (
                      <span className={`text-[11px] font-medium tabular-nums ${r.pct_manteve >= 80 ? 'text-emerald-700' : r.pct_manteve >= 50 ? 'text-amber-700' : 'text-rose-600'}`}>
                        {r.pct_manteve}%
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2 text-slate-700">{r.principal_destino_final ?? <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* === Leads "presos" === */}
      {ranking_lentos.length > 0 && (
        <SectionCard
          title="🚧 Leads presos entre passos"
          subtitle="Marcou um passo do funil mas não avançou em 7-120 dias. Clique pra abrir o card."
        >
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2 font-medium">Card</th>
                <th className="py-2 font-medium">Onde travou</th>
                <th className="py-2 font-medium">Origem</th>
                <th className="py-2 font-medium">Faixa</th>
                <th className="py-2 font-medium text-right">Parado há</th>
              </tr>
            </thead>
            <tbody>
              {ranking_lentos.map((r) => (
                <tr key={`${r.card_id}-${r.gargalo}`} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2">
                    <Link to={`/cards/${r.card_id}`} className="text-indigo-700 hover:underline font-medium">{r.titulo.slice(0, 50)}{r.titulo.length > 50 ? '…' : ''}</Link>
                  </td>
                  <td className="py-2 text-slate-700">{r.gargalo}</td>
                  <td className="py-2 text-slate-500">{r.origem}</td>
                  <td className="py-2 text-slate-500">{r.faixa ?? <span className="text-slate-300">—</span>}</td>
                  <td className="py-2 text-right tabular-nums text-rose-600 font-medium">{r.dias}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  )
}

function TempoCard({ label, mediana, p75, amostra, hint }: { label: string; mediana: number | null; p75: number | null; amostra: number; hint?: string }) {
  if (amostra === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="mt-2 text-sm text-slate-400">sem dados</div>
      </div>
    )
  }
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-lg p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{mediana ?? '—'}<span className="text-sm font-normal text-slate-500 ml-1">dias</span></div>
      <div className="text-xs text-slate-500 mt-0.5">típico (mediana de {amostra} leads)</div>
      {p75 !== null && (
        <div className="text-xs text-slate-400 mt-1">75% fizeram em até {p75}d</div>
      )}
      {hint && <div className="text-[11px] text-slate-400 mt-2 italic">{hint}</div>}
    </div>
  )
}
