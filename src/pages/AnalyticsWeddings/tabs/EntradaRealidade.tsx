import { useFilterParams } from '../components/FilterBar'
import { useWwDriftVenda, type WwDriftVenda } from '@/hooks/analyticsWeddings/useWw2'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { formatCurrency, formatNumber } from '../lib/format'

const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']
const CONV_ORDER = ['Apenas o casal', 'Até 20', '20-50', '50-80', '80-100', '+100']

export function EntradaRealidade() {
  const filters = useFilterParams()
  const { data, isLoading, error } = useWwDriftVenda(filters)

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  return (
    <div className="space-y-5">
      <UniversoHeader data={data} />
      <InvestimentoDrift data={data} />
      <DestinoDrift data={data} />
      <ConvidadosDrift data={data} />
    </div>
  )
}

function UniversoHeader({ data }: { data: WwDriftVenda }) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">🔄 Entrada × Realidade</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Universo: <strong>{formatNumber(data.total_vendas)} vendas fechadas</strong> no período.
            Comparando o que o casal disse no formulário do site × o que <strong>efetivamente contratou</strong>.
          </p>
        </div>
        <div className="text-xs bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-indigo-700">
          📅 Filtrando por <strong>data da venda</strong>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INVESTIMENTO — entrada × valor R$ vendido
// ─────────────────────────────────────────────────────────────────────────────
function InvestimentoDrift({ data }: { data: WwDriftVenda }) {
  const inv = data.investimento
  const { cobertura, drift, matriz, ticket_por_entrada } = inv
  const universo = cobertura.com_ambos

  if (data.total_vendas === 0) {
    return (
      <SectionCard title="💰 Investimento — entrada × valor vendido" subtitle="Nenhuma venda no período selecionado">
        <EmptyState message="Sem vendas fechadas no período" />
      </SectionCard>
    )
  }

  // Matriz: faixas presentes na entrada e nas vendidas, na ordem canônica
  const faixasEntrada = FAIXA_ORDER.filter(f => matriz.some(m => m.faixa_e === f))
  const faixasVendida = FAIXA_ORDER.filter(f => matriz.some(m => m.faixa_v === f))
  const matrizMap = new Map(matriz.map(m => [`${m.faixa_e}|${m.faixa_v}`, m]))

  return (
    <SectionCard
      title="💰 Investimento — entrada × valor R$ que vendeu"
      subtitle={`Quanto a faixa que o casal disse no site bate com o valor real do pacote contratado.`}
    >
      <CoberturaBanner
        com_entrada={cobertura.com_entrada}
        com_realidade={cobertura.com_valor_real}
        com_ambos={cobertura.com_ambos}
        total={data.total_vendas}
        nome_entrada="faixa no site"
        nome_realidade="valor R$ do pacote"
      />

      {universo === 0 ? (
        <EmptyState message="Nenhuma venda fechada tem entrada + valor real do pacote para comparar" />
      ) : (
        <>
          {/* Resumo do drift */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
            <DriftCard label="Manteve a faixa" value={drift.manteve} total={universo} color="emerald" hint="Vendeu na faixa que disse" />
            <DriftCard label="Vendeu MAIS" value={drift.subiu} total={universo} color="indigo" hint="Subiu de faixa entre entrada e venda" />
            <DriftCard label="Vendeu MENOS" value={drift.desceu} total={universo} color="amber" hint="Desceu de faixa entre entrada e venda" />
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">Ticket médio geral</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{formatCurrency(drift.ticket_medio_geral)}</div>
              <div className="text-xs text-slate-500 mt-0.5">média do pacote contratado</div>
            </div>
          </div>

          {/* Ticket médio por faixa de entrada */}
          {ticket_por_entrada.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Ticket vendido por faixa que o casal disse</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Faixa na entrada</th>
                      <th className="px-3 py-2 text-right font-medium">Amostra</th>
                      <th className="px-3 py-2 text-right font-medium">Mediana</th>
                      <th className="px-3 py-2 text-right font-medium">Médio</th>
                      <th className="px-3 py-2 text-right font-medium">P25 – P75</th>
                      <th className="px-3 py-2 text-right font-medium">Mín – Máx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticket_por_entrada.map(t => (
                      <tr key={t.faixa_e} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-900">{t.faixa_e}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{t.amostra}</td>
                        <td className="px-3 py-2 text-right text-slate-900 font-medium tabular-nums">{formatCurrency(t.mediana)}</td>
                        <td className="px-3 py-2 text-right text-slate-700 tabular-nums">{formatCurrency(t.ticket_medio)}</td>
                        <td className="px-3 py-2 text-right text-slate-500 text-xs tabular-nums">{formatCurrency(t.p25)} – {formatCurrency(t.p75)}</td>
                        <td className="px-3 py-2 text-right text-slate-400 text-xs tabular-nums">{formatCurrency(t.minv)} – {formatCurrency(t.maxv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Matriz de transição */}
          {faixasEntrada.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Matriz: o que disse × faixa real do pacote vendido</h4>
              <p className="text-xs text-slate-500 mb-2">Linha = entrada. Coluna = faixa em que o pacote efetivamente caiu (R$ pacote ÷ faixas canônicas). Verde = manteve. Azul = vendeu mais. Âmbar = vendeu menos.</p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Entrada ↓ / Vendeu →</th>
                      {faixasVendida.map(fv => (
                        <th key={fv} className="px-3 py-2 text-center font-medium text-slate-700">{fv}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {faixasEntrada.map(fe => {
                      const rowTotal = faixasVendida.reduce((s, fv) => s + (matrizMap.get(`${fe}|${fv}`)?.qtd ?? 0), 0)
                      return (
                        <tr key={fe} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{fe}</td>
                          {faixasVendida.map(fv => {
                            const cell = matrizMap.get(`${fe}|${fv}`)
                            const qtd = cell?.qtd ?? 0
                            const eIdx = FAIXA_ORDER.indexOf(fe)
                            const vIdx = FAIXA_ORDER.indexOf(fv)
                            let bg = 'bg-slate-50'
                            if (qtd > 0) {
                              if (vIdx === eIdx) bg = 'bg-emerald-100 text-emerald-900'
                              else if (vIdx > eIdx) bg = 'bg-indigo-50 text-indigo-900'
                              else bg = 'bg-amber-50 text-amber-900'
                            }
                            return (
                              <td key={fv} className={`px-3 py-2 text-center ${bg} ${qtd === 0 ? 'text-slate-300' : ''}`}>
                                {qtd > 0 ? (
                                  <div>
                                    <div className="font-semibold">{qtd}</div>
                                    {cell?.ticket_medio && <div className="text-[10px] opacity-75">{formatCurrency(cell.ticket_medio)}</div>}
                                  </div>
                                ) : '0'}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-center text-slate-500 font-medium border-l border-slate-100">{rowTotal}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DESTINO — entrada × destino vendido
// ─────────────────────────────────────────────────────────────────────────────
function DestinoDrift({ data }: { data: WwDriftVenda }) {
  const dest = data.destino
  const { cobertura, drift, matriz, top_migracoes } = dest
  const universo = cobertura.com_ambos

  const destinosE = Array.from(new Set(matriz.map(m => m.dest_e)))
  const destinosV = Array.from(new Set(matriz.map(m => m.dest_v)))
  const matrizMap = new Map(matriz.map(m => [`${m.dest_e}|${m.dest_v}`, m.qtd]))

  if (data.total_vendas === 0) return null

  return (
    <SectionCard
      title="🏝️  Destino — entrada × destino vendido"
      subtitle="Para onde o casal disse que queria casar × onde a venda efetivamente saiu."
    >
      <CoberturaBanner
        com_entrada={cobertura.com_entrada}
        com_realidade={cobertura.com_vendido}
        com_ambos={cobertura.com_ambos}
        total={data.total_vendas}
        nome_entrada="destino no site"
        nome_realidade="destino vendido"
      />

      {universo === 0 ? (
        <EmptyState message="Nenhuma venda tem entrada + destino vendido para comparar" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <DriftCard label="Manteve o destino" value={drift.manteve} total={universo} color="emerald" hint="Vendeu para onde disse" />
            <DriftCard label="Migrou de destino" value={drift.mudou} total={universo} color="amber" hint="Mudou entre site e venda" />
          </div>

          {top_migracoes.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Top migrações (quem mudou, foi pra onde)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {top_migracoes.map((m, i) => (
                  <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
                    <div className="text-slate-600 truncate">{m.de}</div>
                    <div className="text-amber-700 font-medium">→ {m.para}</div>
                    <div className="text-amber-900 font-semibold mt-1">{m.qtd} lead{m.qtd > 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {destinosE.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Matriz completa</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Entrada ↓ / Vendeu →</th>
                      {destinosV.map(d => <th key={d} className="px-3 py-2 text-center font-medium text-slate-700">{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {destinosE.map(de => (
                      <tr key={de} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{de}</td>
                        {destinosV.map(dv => {
                          const qtd = matrizMap.get(`${de}|${dv}`) ?? 0
                          const isDiag = de === dv
                          const bg = qtd === 0 ? 'bg-slate-50 text-slate-300' : isDiag ? 'bg-emerald-100 text-emerald-900 font-semibold' : 'bg-amber-50 text-amber-900'
                          return <td key={dv} className={`px-3 py-2 text-center ${bg}`}>{qtd}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVIDADOS — entrada × refinado pela closer
// ─────────────────────────────────────────────────────────────────────────────
function ConvidadosDrift({ data }: { data: WwDriftVenda }) {
  const conv = data.convidados
  const { cobertura, drift, matriz } = conv
  const universo = cobertura.com_ambos
  const matrizMap = new Map(matriz.map(m => [`${m.conv_e}|${m.conv_r}`, m.qtd]))

  if (data.total_vendas === 0) return null

  const convE = CONV_ORDER.filter(c => matriz.some(m => m.conv_e === c))
  const convR = CONV_ORDER.filter(c => matriz.some(m => m.conv_r === c))

  return (
    <SectionCard
      title="👥 Convidados — entrada × refinado pela closer"
      subtitle="Não temos campo de convidados confirmado na venda. Usamos o refinado pela closer como melhor aproximação."
    >
      <CoberturaBanner
        com_entrada={cobertura.com_entrada}
        com_realidade={cobertura.com_refinado}
        com_ambos={cobertura.com_ambos}
        total={data.total_vendas}
        nome_entrada="convidados no site"
        nome_realidade="convidados refinado"
      />

      {universo === 0 ? (
        <EmptyState message="Nenhuma venda tem entrada + refinado de convidados para comparar" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <DriftCard label="Manteve" value={drift.manteve} total={universo} color="emerald" hint="Confirmou a faixa que disse" />
            <DriftCard label="Aumentou" value={drift.subiu} total={universo} color="indigo" hint="Acabou em faixa maior" />
            <DriftCard label="Diminuiu" value={drift.desceu} total={universo} color="amber" hint="Acabou em faixa menor" />
          </div>

          {convE.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Matriz de transição</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">Entrada ↓ / Refinado →</th>
                      {convR.map(c => <th key={c} className="px-3 py-2 text-center font-medium text-slate-700">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {convE.map(ce => (
                      <tr key={ce} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{ce}</td>
                        {convR.map(cr => {
                          const qtd = matrizMap.get(`${ce}|${cr}`) ?? 0
                          const eIdx = CONV_ORDER.indexOf(ce)
                          const rIdx = CONV_ORDER.indexOf(cr)
                          let bg = qtd === 0 ? 'bg-slate-50 text-slate-300' : ''
                          if (qtd > 0) {
                            if (eIdx === rIdx) bg = 'bg-emerald-100 text-emerald-900 font-semibold'
                            else if (rIdx > eIdx) bg = 'bg-indigo-50 text-indigo-900'
                            else bg = 'bg-amber-50 text-amber-900'
                          }
                          return <td key={cr} className={`px-3 py-2 text-center ${bg}`}>{qtd}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function CoberturaBanner({ com_entrada, com_realidade, com_ambos, total, nome_entrada, nome_realidade }: {
  com_entrada: number; com_realidade: number; com_ambos: number; total: number
  nome_entrada: string; nome_realidade: string
}) {
  if (total === 0) return null
  const pctEntrada = total > 0 ? Math.round(100 * com_entrada / total) : 0
  const pctReal = total > 0 ? Math.round(100 * com_realidade / total) : 0
  const pctAmbos = total > 0 ? Math.round(100 * com_ambos / total) : 0
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
        <div className="text-slate-500">Tem {nome_entrada}</div>
        <div className="text-slate-900 font-semibold mt-0.5">{com_entrada} <span className="text-slate-400 text-[11px] font-normal">({pctEntrada}% das vendas)</span></div>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
        <div className="text-slate-500">Tem {nome_realidade}</div>
        <div className="text-slate-900 font-semibold mt-0.5">{com_realidade} <span className="text-slate-400 text-[11px] font-normal">({pctReal}%)</span></div>
      </div>
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2">
        <div className="text-indigo-600">Universo p/ comparação</div>
        <div className="text-indigo-900 font-semibold mt-0.5">{com_ambos} <span className="text-indigo-500 text-[11px] font-normal">({pctAmbos}%)</span></div>
      </div>
    </div>
  )
}

function DriftCard({ label, value, total, color, hint }: { label: string; value: number; total: number; color: 'emerald' | 'indigo' | 'amber'; hint?: string }) {
  const pct = total > 0 ? Math.round(100 * value / total) : 0
  const colors = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    indigo:  'bg-indigo-50 border-indigo-200 text-indigo-900',
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
  }
  return (
    <div className={`border rounded-xl p-3 ${colors[color]}`}>
      <div className="text-xs uppercase tracking-wide font-medium opacity-75">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-sm opacity-75">({pct}%)</div>
      </div>
      {hint && <div className="text-xs opacity-70 mt-0.5">{hint}</div>}
    </div>
  )
}
