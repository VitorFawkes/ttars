import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { FilterBar, type TabProps, type AppliedFilters } from '../components/FilterBar'
import { useWwQualidadeLead, type WwQualidadeLead, type WwQualidadeCategoria, type WwQualidadeCanal, type WwPerfilCompareDimensao } from '@/hooks/analyticsWeddings/useWw2'
import { useAnalyticsVariant, type AnalyticsVariant } from '@/hooks/analyticsWeddings/AnalyticsVariantContext'
import { SectionCard, EmptyState, LoadingSkeleton, ErrorBanner } from '../components/ui'
import { ClickableRow } from '../components/ClickableRow'
import { DrillDrawer, type DrillContext } from '../components/DrillDrawer'
import { MatrixHeatmap } from '../components/MatrixHeatmap'
import { PerfilCompareChart } from '../components/PerfilCompareChart'
import { formatCurrency, formatMes, formatNumber } from '../lib/format'

// Inclui os baldes FUNDIDOS ('R$50-100 mil', '50-100') e variantes legadas — bucket fora
// da lista NUNCA pode sumir do heatmap (o MatrixHeatmap agora joga desconhecidos pro fim).
const FAIXA_ORDER = ['Até R$50 mil', 'R$50-80 mil', 'R$50-100 mil', 'R$80-100 mil', 'R$100-200 mil', 'R$200-500 mil', '+R$500 mil']
const CONV_ORDER = ['Apenas o casal', 'Até 20', 'Ate 20', '20-50', '50-80', '50-100', '80-100', '+100']

type Dim = 'faixa' | 'destino' | 'convidados' | 'origem' | 'tipo'

export function Qualidade({ filters, onFiltersChange }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Pergunta da aba: "que lead converte?" — não filtra por faixa/destino/convidados porque
          são as PRÓPRIAS dimensões analisadas. Canal SDR e Closer entram como recorte. */}
      {/* Sem alternância criação/entrada: qualidade do lead é uma taxa de conversão — sempre
          sobre o lead que entrou (safra). "O que aconteceu no período" dividia fechamentos do
          período por entradas do período (cohortes diferentes → taxa sem sentido). Fica só safra. */}
      {/* Filtro de status removido desta aba: filtrar por perdido/aberto zera os fechamentos por
          construção → conversão 0% em tudo (são mutuamente exclusivos de "ganho"). */}
      <FilterBar value={filters} onChange={onFiltersChange} show={['period', 'tipo', 'origem', 'canal_sdr', 'canal_closer']} />
      <QualidadeContent filters={filters} />
    </div>
  )
}

function QualidadeContent({ filters }: { filters: AppliedFilters }) {
  const variant = useAnalyticsVariant()
  const [minAmostra, setMinAmostra] = useState<number>(3)
  const [perfilDim, setPerfilDim] = useState<Dim>('faixa')
  const [drill, setDrill] = useState<DrillContext | null>(null)

  const { data, isLoading, error } = useWwQualidadeLead(filters, null, minAmostra)
  // Drill carrega os filtros ativos da aba junto com o clique.
  const baseCtx = {
    dateStart: filters.dateStart, dateEnd: filters.dateEnd, dateMode: filters.dateMode,
    origins: filters.origins, tipos: filters.tipos,
    canalSdr: filters.canalSdr, canalCloser: filters.canalCloser, statusLead: filters.statusLead,
  }

  if (isLoading) return <LoadingSkeleton rows={10} />
  if (error) return <ErrorBanner error={error as Error} />
  if (!data || data.error) return <EmptyState message={data?.error ?? 'Sem dados'} />

  const perfilCompare = data.comparacao_entrada_vs_fechamento ?? []
  const perfilAtual: WwPerfilCompareDimensao | undefined = perfilCompare.find(d => d.dimensao === perfilDim)
  // Ticket no Analytics 2 (native) vem de valor_final, hoje vazio nos ganhos → a coluna some.
  // Sinalizamos a indisponibilidade em vez de esconder sem explicação.
  const temAlgumTicket = [data.por_faixa, data.por_destino, data.por_convidados]
    .some(arr => (arr ?? []).some(c => (c.ticket_amostra ?? 0) > 0 && (c.ticket_medio ?? 0) > 0))
  const ticketIndisponivel = variant === 'native' && !temAlgumTicket

  return (
    <div className="space-y-5">
      <Controls minAmostra={minAmostra} onMinAmostra={setMinAmostra} data={data} />
      <UniversoHeader
        data={data}
        ticketIndisponivel={ticketIndisponivel}
        onEntraram={() => setDrill({ ...baseCtx, marco: 'marcou_sdr', title: 'Leads que entraram no funil de reuniões' })}
        onFecharam={() => setDrill({ ...baseCtx, marco: 'ganho', title: 'Casais que fecharam' })}
      />

      {/* Conversão por tipo de reunião (20260611a) — só aparece quando o banco já devolve o breakdown */}
      {((data.por_canal_sdr?.length ?? 0) > 0 || (data.por_canal_closer?.length ?? 0) > 0) && (
        <ConversaoPorCanal
          sdr={data.por_canal_sdr ?? []}
          closer={data.por_canal_closer ?? []}
          onPick={(kind, canal) => setDrill({
            ...baseCtx,
            ...(kind === 'sdr' ? { canalSdr: [canal] } : { canalCloser: [canal] }),
            title: `Casais: ${kind === 'sdr' ? '1ª reunião' : 'reunião de fechamento'} por ${canal}`,
          })}
        />
      )}

      {/* Perfil de quem entra vs quem fecha */}
      {perfilCompare.length > 0 && (
        <SectionCard
          title="🎯 Quem ENTRA × quem FECHA"
          subtitle="Pra cada categoria, comparamos o % de leads que entraram com o % de vendas que fecharam. Lift = quanto a categoria fecha relativamente à média. Verde = sobre-representada nos fechamentos."
        >
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {(['faixa','destino','convidados','origem','tipo'] as Dim[]).map(d => (
              <button
                key={d}
                onClick={() => setPerfilDim(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors active:scale-[0.98] ${perfilDim === d ? 'bg-ww-gold text-white border-ww-gold' : 'bg-white text-slate-700 border-ww-sand hover:border-ww-sand-dk'}`}
              >
                {labelDim(d)}
              </button>
            ))}
          </div>
          {perfilAtual && perfilAtual.dados.length > 0 ? (
            <PerfilCompareChart
              dados={perfilAtual.dados}
              dimensao={perfilDim}
              minSample={1}
              order={perfilDim === 'faixa' ? FAIXA_ORDER : perfilDim === 'convidados' ? CONV_ORDER : undefined}
              onCategoriaClick={(cat) => setDrill(buildDrillForDim(baseCtx, perfilDim, cat))}
            />
          ) : (
            <EmptyState message="Sem dados suficientes nessa dimensão" />
          )}
        </SectionCard>
      )}

      <FunilPorCategoria
        title="💰 Por faixa de investimento declarada"
        subtitle="Dos leads que agendaram reunião no período, quantos fecharam, agrupados pela faixa declarada no site."
        items={data.por_faixa}
        unidade="faixa"
        variant={variant}
        outros={data.outros_amostra_pequena?.faixa}
        onRowClick={(cat) => setDrill({ ...baseCtx, faixa: cat, title: `Casais: faixa "${cat}"` })}
      />
      <FunilPorCategoria
        title="🏝️  Por destino declarado"
        subtitle="Dos leads que agendaram reunião no período, quantos fecharam por destino declarado."
        items={data.por_destino}
        unidade="destino"
        variant={variant}
        outros={data.outros_amostra_pequena?.destino}
        onRowClick={(cat) => setDrill({ ...baseCtx, destino: cat, title: `Casais: destino "${cat}"` })}
      />
      <FunilPorCategoria
        title="👥 Por número de convidados declarado"
        subtitle="Dos leads que agendaram reunião no período, quantos fecharam por tamanho de celebração."
        items={data.por_convidados}
        unidade="convidados"
        variant={variant}
        outros={data.outros_amostra_pequena?.convidados}
        onRowClick={(cat) => setDrill({ ...baseCtx, convidados: cat, title: `Casais: ${cat} convidados` })}
      />

      <HeatmapFaixaDestino data={data} onCellClick={(faixa, destino) => setDrill({ ...baseCtx, faixa, destino, title: `Casais: ${faixa} × ${destino}` })} />

      {/* Cruzamentos novos */}
      {data.cruzamentos?.faixa_x_origem && data.cruzamentos.faixa_x_origem.length > 0 && (
        <SectionCard
          title="💰 × 🎯  Faixa × Origem"
          subtitle="Linha = faixa que o casal declarou. Coluna = origem do lead. Cada célula = % que fechou. Identifica qual fonte traz lead de cada faixa."
        >
          <MatrixHeatmap
            cells={data.cruzamentos.faixa_x_origem}
            rowsOrder={FAIXA_ORDER}
            rowLabel="Faixa"
            colLabel="Origem"
            onCellClick={(faixa, origem) => setDrill({ ...baseCtx, faixa, origem, title: `Casais: ${faixa} via ${origem}` })}
          />
        </SectionCard>
      )}

      {data.cruzamentos?.destino_x_origem && data.cruzamentos.destino_x_origem.length > 0 && (
        <SectionCard
          title="🏝️ × 🎯  Destino × Origem"
          subtitle="Qual destino tem mais leads de qual fonte? % é taxa de fechamento."
        >
          <MatrixHeatmap
            cells={data.cruzamentos.destino_x_origem}
            rowLabel="Destino"
            colLabel="Origem"
            onCellClick={(destino, origem) => setDrill({ ...baseCtx, destino, origem, title: `Casais: ${destino} via ${origem}` })}
          />
        </SectionCard>
      )}

      {data.cruzamentos?.faixa_x_tipo && data.cruzamentos.faixa_x_tipo.length > 0 && (
        <SectionCard
          title="💰 × 👰  Faixa × Tipo de casamento"
          subtitle="DW vs Elopment dentro de cada faixa de investimento."
        >
          <MatrixHeatmap
            cells={data.cruzamentos.faixa_x_tipo}
            rowsOrder={FAIXA_ORDER}
            rowLabel="Faixa"
            colLabel="Tipo"
            onCellClick={(faixa, tipo) => setDrill({ ...baseCtx, faixa, tipo, title: `Casais: ${faixa} (${tipo})` })}
          />
        </SectionCard>
      )}

      {data.cruzamentos?.convidados_x_origem && data.cruzamentos.convidados_x_origem.length > 0 && (
        <SectionCard
          title="👥 × 🎯  Convidados × Origem"
          subtitle="Tamanho da celebração que cada fonte traz."
        >
          <MatrixHeatmap
            cells={data.cruzamentos.convidados_x_origem}
            rowsOrder={CONV_ORDER}
            rowLabel="Convidados"
            colLabel="Origem"
            onCellClick={(_conv, origem) => setDrill({ ...baseCtx, origem, title: `Casais: origem ${origem}` })}
          />
        </SectionCard>
      )}

      {/* Evolução mensal por faixa */}
      {data.evolucao_mensal_por_faixa && data.evolucao_mensal_por_faixa.length > 0 && (
        <EvolucaoMensalFaixa items={data.evolucao_mensal_por_faixa} />
      )}

      <DrillDrawer ctx={drill} onClose={() => setDrill(null)} />
    </div>
  )
}

function buildDrillForDim(baseCtx: { dateStart: string; dateEnd: string }, dim: Dim, cat: string): DrillContext {
  const title = `Casais: ${labelDim(dim)} "${cat}"`
  switch (dim) {
    case 'faixa':      return { ...baseCtx, faixa: cat, title }
    case 'destino':    return { ...baseCtx, destino: cat, title }
    case 'origem':     return { ...baseCtx, origem: cat, title }
    case 'tipo':       return { ...baseCtx, tipo: cat, title }
    case 'convidados': return { ...baseCtx, convidados: cat, title }
    default:           return { ...baseCtx, title }
  }
}

function labelDim(d: Dim): string {
  switch (d) {
    case 'faixa': return 'Faixa'
    case 'destino': return 'Destino'
    case 'convidados': return 'Convidados'
    case 'origem': return 'Origem'
    case 'tipo': return 'Tipo'
  }
}

function Controls({ minAmostra, onMinAmostra, data }: { minAmostra: number; onMinAmostra: (v: number) => void; data: WwQualidadeLead }) {
  const outros = data.outros_amostra_pequena
  const escondidasFaixa = outros?.faixa?.categorias_agrupadas?.length ?? 0
  const escondidasDestino = outros?.destino?.categorias_agrupadas?.length ?? 0
  const escondidasConv = outros?.convidados?.categorias_agrupadas?.length ?? 0
  const totalEscondidas = escondidasFaixa + escondidasDestino + escondidasConv
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3 flex-wrap text-xs">
      <span className="font-medium text-slate-700">Esconder categorias com menos de</span>
      {[2, 3, 5, 10].map(n => (
        <button
          key={n}
          onClick={() => onMinAmostra(n)}
          className={`px-2.5 py-1 rounded-md border transition-colors active:scale-[0.98] ${minAmostra === n ? 'bg-ww-gold text-white border-ww-gold' : 'bg-white text-slate-700 border-ww-sand hover:border-ww-sand-dk'}`}
        >
          {n} leads
        </button>
      ))}
      {totalEscondidas > 0 && (
        <span className="text-slate-500">
          · <strong className="text-slate-700">{totalEscondidas}</strong> categoria{totalEscondidas !== 1 ? 's' : ''} agrupada{totalEscondidas !== 1 ? 's' : ''} em "Outros (amostra pequena)"
        </span>
      )}
    </div>
  )
}

function UniversoHeader({ data, ticketIndisponivel, onEntraram, onFecharam }: {
  data: WwQualidadeLead; ticketIndisponivel?: boolean
  onEntraram?: () => void; onFecharam?: () => void
}) {
  const numBtn = 'underline decoration-dotted decoration-slate-300 underline-offset-2 hover:decoration-solid hover:decoration-current cursor-pointer'
  return (
    <div className="bg-gradient-to-r from-ww-cream/80 to-white border border-ww-sand rounded-xl p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div className="max-w-3xl">
          <h2 className="text-base font-semibold text-slate-900">🎯 Qualidade do lead</h2>
          <p className="text-sm text-slate-600 mt-1">
            <strong className={onEntraram ? numBtn : ''} onClick={onEntraram} title="Ver os casais">{formatNumber(data.total_entraram)} leads</strong> que agendaram reunião no período,
            <strong className={`text-emerald-700 ${onFecharam ? numBtn : ''}`} onClick={onFecharam} title="Ver os casais"> {formatNumber(data.total_fecharam)} fecharam</strong>
            <span className="text-slate-500"> · taxa de conversão </span>
            <strong className="text-ww-gold-ink">{data.taxa_conversao_geral_pct ?? 0}%</strong>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Cobertura do formulário do site: <strong>{data.cobertura.com_faixa}</strong> com faixa,
            {' '}<strong>{data.cobertura.com_destino}</strong> com destino,
            {' '}<strong>{data.cobertura.com_convidados}</strong> com nº convidados.
          </p>
          {ticketIndisponivel && (
            <p className="text-xs text-amber-700 mt-1">
              💡 O ticket médio não aparece aqui: o valor de contrato não é preenchido no ttars. Veja o Analytics 1 para o orçamento médio declarado.
            </p>
          )}
        </div>
        <div className="text-xs bg-white border border-ww-sand rounded-lg px-3 py-1.5 text-ww-gold-ink whitespace-nowrap">
          📅 <strong>Data de criação do lead</strong>
        </div>
      </div>
    </div>
  )
}

function FunilPorCategoria({ title, subtitle, items, unidade, variant, outros, onRowClick }: {
  title: string; subtitle: string; items: WwQualidadeCategoria[]; unidade: 'faixa' | 'destino' | 'convidados'
  variant: AnalyticsVariant
  outros?: { entraram: number | null; fecharam: number | null; categorias_agrupadas: string[] | null }
  onRowClick?: (categoria: string) => void
}) {
  if (items.length === 0 && (!outros || !outros.entraram)) {
    return (
      <SectionCard title={title} subtitle={subtitle}>
        <EmptyState message="Sem dados suficientes no período" />
      </SectionCard>
    )
  }

  // Dimensões ordinais saem na ordem canônica (não confiar na ordem do banco);
  // categoria fora da lista vai pro fim em vez de bagunçar. Destino: por volume.
  // "Não informado" (balde dos leads sem a dimensão declarada) sempre por último.
  const NAO_INFO = 'Não informado'
  const ordem = unidade === 'faixa' ? FAIXA_ORDER : unidade === 'convidados' ? CONV_ORDER : null
  const sorted = ordem
    ? [...items].sort((a, b) => {
        if (a.categoria === NAO_INFO) return 1
        if (b.categoria === NAO_INFO) return -1
        const ia = ordem.indexOf(a.categoria); const ib = ordem.indexOf(b.categoria)
        if (ia === -1 && ib === -1) return b.entraram - a.entraram
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
    : [...items].sort((a, b) => {
        if (a.categoria === NAO_INFO) return 1
        if (b.categoria === NAO_INFO) return -1
        return b.entraram - a.entraram
      })
  const maxEntraram = Math.max(1, ...sorted.map(s => s.entraram))
  const maxTaxa = Math.max(0.1, ...sorted.map(s => s.taxa_pct ?? 0))
  const temTicket = sorted.some(s => (s.ticket_amostra ?? 0) > 0 && (s.ticket_medio ?? 0) > 0)

  const hasOutros = outros && outros.entraram && outros.entraram > 0

  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="border border-ww-sand rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ww-cream/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Categoria que o lead declarou</th>
              <th className="px-3 py-2 text-left font-medium" style={{ minWidth: 200 }}>Entraram no período</th>
              <th className="px-3 py-2 text-right font-medium">Fecharam contrato</th>
              <th className="px-3 py-2 text-left font-medium" style={{ minWidth: 150 }}>Taxa de conversão</th>
              {temTicket && <th className="px-3 py-2 text-right font-medium" title={variant === 'native' ? 'Valor médio de contrato dos fechados nessa categoria (ttars)' : 'Orçamento médio que o casal declarou no Active (entre os fechados) — não é o valor do contrato'}>{variant === 'native' ? 'Ticket médio (contrato)' : 'Orçamento médio declarado'}</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(it => {
              const pctEntraram = (it.entraram / maxEntraram) * 100
              const taxa = it.taxa_pct ?? 0
              const taxaBarPct = (taxa / maxTaxa) * 100
              const taxaCor = taxa >= 5 ? 'bg-emerald-500' : taxa >= 2 ? 'bg-indigo-500' : taxa >= 1 ? 'bg-amber-400' : 'bg-rose-300'
              const cells = (
                <>
                  <td className="px-3 py-2 text-slate-900 font-medium whitespace-nowrap">{it.categoria}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden relative">
                        <div className="h-full bg-slate-400" style={{ width: `${pctEntraram}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-900 w-14 text-right font-medium">{formatNumber(it.entraram)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900 font-medium tabular-nums">{formatNumber(it.fecharam)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                        <div className={`h-full ${taxaCor}`} style={{ width: `${taxaBarPct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums w-14 text-right font-medium text-slate-900">{taxa}%</span>
                    </div>
                  </td>
                  {temTicket && (
                    <td className="px-3 py-2 text-right tabular-nums text-xs"
                        title={it.ticket_amostra > 0 ? `Média de ${it.ticket_amostra} venda${it.ticket_amostra !== 1 ? 's' : ''} com valor preenchido` : 'Nenhuma venda com valor preenchido'}>
                      {it.ticket_amostra > 0 && (it.ticket_medio ?? 0) > 0
                        ? <span className="text-slate-900 font-medium">{formatCurrency(it.ticket_medio)} <span className="text-slate-400 font-normal">({it.ticket_amostra})</span></span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  )}
                </>
              )
              return onRowClick ? (
                <ClickableRow
                  key={it.categoria}
                  onClick={() => onRowClick(it.categoria)}
                  className="border-t border-slate-100"
                  title={`Ver casais: ${it.categoria}`}
                >
                  {cells}
                </ClickableRow>
              ) : (
                <tr key={it.categoria} className="border-t border-slate-100">{cells}</tr>
              )
            })}
            {hasOutros && (
              <tr className="border-t border-slate-100 bg-slate-50/50">
                <td className="px-3 py-2 text-slate-500 italic" title={(outros?.categorias_agrupadas ?? []).join(', ')}>
                  Outros (amostra pequena): {outros?.categorias_agrupadas?.length ?? 0} categoria{(outros?.categorias_agrupadas?.length ?? 0) !== 1 ? 's' : ''}
                </td>
                <td className="px-3 py-2 text-slate-500 text-right tabular-nums">{formatNumber(outros?.entraram ?? 0)}</td>
                <td className="px-3 py-2 text-slate-500 text-right tabular-nums">{formatNumber(outros?.fecharam ?? 0)}</td>
                <td className="px-3 py-2 text-slate-400 text-xs italic">amostra insuficiente</td>
                {temTicket && <td className="px-3 py-2" />}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

// Conversão por tipo de reunião — universo = quem FEZ a reunião por aquele canal.
// A pergunta do diretor: "vale insistir em vídeo? WhatsApp fecha?"
function ConversaoPorCanal({ sdr, closer, onPick }: { sdr: WwQualidadeCanal[]; closer: WwQualidadeCanal[]; onPick?: (kind: 'sdr' | 'closer', canal: string) => void }) {
  return (
    <SectionCard
      title="🎥 Conversão por tipo de reunião"
      subtitle="Só casais que FIZERAM a reunião. Compara como a reunião aconteceu (Vídeo, WhatsApp, Telefone, Presencial) com quantos viraram contrato. Clique numa linha pra ver os casais."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CanalTabela titulo="1ª reunião (SDR)" items={sdr} vazio="Nenhuma reunião de SDR com canal registrado no período" onRow={onPick ? (c) => onPick('sdr', c) : undefined} />
        <CanalTabela
          titulo="Reunião de fechamento (Closer)"
          items={closer}
          vazio="Nenhuma reunião de Closer com canal registrado no período"
          nota={closer.length > 0 ? 'O canal da reunião Closer começou a ser registrado em nov/2025; períodos antigos têm pouca cobertura.' : undefined}
          onRow={onPick ? (c) => onPick('closer', c) : undefined}
        />
      </div>
    </SectionCard>
  )
}

function CanalTabela({ titulo, items, vazio, nota, onRow }: { titulo: string; items: WwQualidadeCanal[]; vazio: string; nota?: string; onRow?: (canal: string) => void }) {
  const max = Math.max(1, ...items.map(i => i.entraram))
  const maxTaxa = Math.max(0.1, ...items.map(i => i.taxa_pct ?? 0))
  return (
    <div>
      <h4 className="font-ww-serif text-base font-semibold text-ww-n700 mb-2">{titulo}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-ww-n400 italic py-3">{vazio}</p>
      ) : (
        <>
          {/* Mobile: lista compacta — a taxa (o número que importa) sempre visível */}
          <div className="sm:hidden border border-ww-sand rounded-lg overflow-hidden divide-y divide-ww-sand/60">
            {items.map(it => {
              const taxa = it.taxa_pct ?? 0
              const taxaTom = taxa >= 10 ? 'text-emerald-700' : taxa >= 5 ? 'text-ww-gold-ink' : taxa >= 2 ? 'text-amber-700' : 'text-rose-600'
              return (
                <div key={it.categoria}
                     onClick={onRow ? () => onRow(it.categoria) : undefined}
                     className={`px-3 py-2.5 bg-white flex items-center gap-2 ${onRow ? 'cursor-pointer hover:bg-ww-cream/50 transition-colors' : ''}`}>
                  <span className="text-sm font-medium text-ww-n700">{it.categoria}</span>
                  <span className="flex-1 text-right text-[11px] text-ww-n500 tabular-nums leading-tight">
                    {formatNumber(it.entraram)} reuniões<br />{formatNumber(it.fecharam)} fecharam
                  </span>
                  <span className={`w-14 text-right text-base font-semibold tabular-nums ${taxaTom}`}>{taxa}%</span>
                </div>
              )
            })}
          </div>
          {/* Desktop: tabela com barras comparativas */}
          <div className="hidden sm:block border border-ww-sand rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ww-cream/60 text-xs uppercase tracking-wide text-ww-n500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Como foi</th>
                  <th className="px-3 py-2 text-left font-medium min-w-[140px]">Fizeram reunião</th>
                  <th className="px-3 py-2 text-right font-medium">Fecharam</th>
                  <th className="px-3 py-2 text-left font-medium min-w-[140px] whitespace-nowrap">Reunião → contrato</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const taxa = it.taxa_pct ?? 0
                  const taxaCor = taxa >= 10 ? 'bg-emerald-500' : taxa >= 5 ? 'bg-ww-gold' : taxa >= 2 ? 'bg-amber-400' : 'bg-rose-300'
                  return (
                    <tr key={it.categoria}
                        onClick={onRow ? () => onRow(it.categoria) : undefined}
                        className={`border-t border-ww-sand/60 ${onRow ? 'cursor-pointer hover:bg-ww-cream/40 transition-colors' : ''}`}>
                      <td className="px-3 py-2 text-ww-n700 font-medium whitespace-nowrap">{it.categoria}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-4 bg-ww-cream rounded overflow-hidden">
                            <div className="h-full bg-ww-n400/60" style={{ width: `${(it.entraram / max) * 100}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-ww-n700 w-10 text-right font-medium">{formatNumber(it.entraram)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ww-n700 font-medium">{formatNumber(it.fecharam)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-4 bg-ww-cream rounded overflow-hidden">
                            <div className={`h-full ${taxaCor}`} style={{ width: `${(taxa / maxTaxa) * 100}%` }} />
                          </div>
                          <span className="text-xs tabular-nums w-12 text-right font-semibold text-ww-n700">{taxa}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {nota && <p className="text-[11px] text-ww-n400 mt-1.5">{nota}</p>}
    </div>
  )
}

function HeatmapFaixaDestino({ data, onCellClick }: { data: WwQualidadeLead; onCellClick?: (faixa: string, destino: string) => void }) {
  const heatmap = data.heatmap_faixa_destino
  if (!heatmap || heatmap.length === 0) {
    return (
      <SectionCard title="🔥 Combos faixa × destino" subtitle="Sem combinações suficientes (mínimo 2 leads por combo).">
        <EmptyState message="Sem dados" />
      </SectionCard>
    )
  }
  const cells = heatmap.map(h => ({
    linha: h.faixa, coluna: h.destino,
    entraram: h.entraram, fecharam: h.fecharam,
    taxa_pct: h.taxa_pct,
  }))
  return (
    <SectionCard
      title="🔥 Combos faixa × destino: onde a conversão acontece"
      subtitle="Linha = faixa de investimento que o lead declarou. Coluna = destino que o lead declarou. % na célula = taxa de fechamento."
    >
      <MatrixHeatmap
        cells={cells}
        rowsOrder={FAIXA_ORDER}
        rowLabel="Faixa"
        colLabel="Destino"
        onCellClick={onCellClick}
      />
    </SectionCard>
  )
}

function EvolucaoMensalFaixa({ items }: { items: { mes: string; categoria: string; entraram: number; fecharam: number; taxa_pct: number | null }[] }) {
  // Pivot para Recharts: [{ mes: '2026-01', 'Até R$50 mil': 12, 'R$50-100 mil': 8, ... }]
  const allMeses = Array.from(new Set(items.map(i => i.mes))).sort()
  const allFaixas = FAIXA_ORDER.filter(f => items.some(i => i.categoria === f))
  const data = allMeses.map(mes => {
    const row: Record<string, number | string> = { mes }
    allFaixas.forEach(f => {
      const it = items.find(i => i.mes === mes && i.categoria === f)
      row[f] = it?.entraram ?? 0
    })
    return row
  })
  // Rampa ordinal: quanto maior a faixa de investimento, mais profunda a cor (champagne → rosewood)
  const colors = ['#94a3b8', '#D6BC94', '#BD965C', '#A37F47', '#874B52', '#5C3A40', '#ef4444']
  return (
    <SectionCard
      title="📅 Evolução mensal por faixa"
      subtitle="Quantos leads de cada faixa entraram em cada mês. Detecta tendências (faixa subindo, faixa caindo)."
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="mes" stroke="#64748b" fontSize={11} tickFormatter={(v) => formatMes(String(v))} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} labelFormatter={(v) => formatMes(String(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {allFaixas.map((f, i) => (
            <Line key={f} type="monotone" dataKey={f} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </SectionCard>
  )
}
