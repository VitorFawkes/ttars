import { useMemo, useState } from 'react'
import { Search, Check, MessageCircle, MoreHorizontal, Flame, Zap, Calendar, Telescope, User as UserIcon, Users, Sparkles, TrendingUp, Wallet, Clock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { useMeuDia, type MeuDiaFilters, type MeuDiaGroupBy } from '../../hooks/concierge/useMeuDia'
import { useMarcarOutcome, useNotificarCliente } from '../../hooks/concierge/useAtendimentoMutations'
import { TIPO_LABEL, SOURCE_LABEL, CATEGORIAS_CONCIERGE, categoriasParaProduto, type TipoConcierge, type SourceConcierge, type StatusApresentacao, type MeuDiaItem, type CategoriaConcierge } from '../../hooks/concierge/types'
import { AtendimentoDetailModal } from '../../components/concierge/AtendimentoDetailModal'
import { TipoBadge, SourceIcon } from '../../components/concierge/Badges'
import { cn } from '../../lib/utils'

type Bucket = 'vencido' | 'hoje' | 'esta_semana' | 'futuro'

const BUCKET_CONFIG: Array<{ id: Bucket; label: string; Icon: typeof Flame; tone: { bg: string; text: string; border: string }; hint: string }> = [
  { id: 'vencido',     label: 'Vencidos',    Icon: Flame,     tone: { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'    }, hint: 'Já passaram do prazo' },
  { id: 'hoje',        label: 'Hoje',        Icon: Zap,       tone: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200'  }, hint: 'Faz hoje' },
  { id: 'esta_semana', label: 'Esta semana', Icon: Calendar,  tone: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' }, hint: 'Tem prazo até domingo' },
  { id: 'futuro',      label: 'Próximas',    Icon: Telescope, tone: { bg: 'bg-slate-100', text: 'text-slate-700',  border: 'border-slate-200'  }, hint: 'Mais distantes' },
]

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function relTime(iso: string) {
  const target = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = target - now
  const diffH = Math.round(diffMs / (1000 * 60 * 60))
  const diffD = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (Math.abs(diffH) < 1) return 'agora'
  if (diffH < 0 && diffH > -24) return `há ${-diffH}h`
  if (diffH < 0) return `há ${-diffD}d`
  if (diffH < 24) return `em ${diffH}h`
  return `em ${diffD}d`
}

export default function MeuDiaPage() {
  const { profile } = useAuth()
  const { slug: produtoAtual } = useCurrentProductMeta()
  const [bucket, setBucket] = useState<Bucket>('vencido')
  const [groupBy, setGroupBy] = useState<MeuDiaGroupBy>('prazo')
  const [tipoFilter, setTipoFilter] = useState<Set<TipoConcierge>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<Set<SourceConcierge>>(new Set())
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<MeuDiaItem | null>(null)

  const marcarOutcome = useMarcarOutcome()
  const notificarCliente = useNotificarCliente()

  const filters: MeuDiaFilters = useMemo(() => ({
    donoId: !showAll && profile?.id ? profile.id : undefined,
    tipos: tipoFilter.size > 0 ? Array.from(tipoFilter) : undefined,
    sources: sourceFilter.size > 0 ? Array.from(sourceFilter) : undefined,
    incluirConcluidos: false,
  }), [profile?.id, showAll, tipoFilter, sourceFilter])

  const { data: items = [], isLoading } = useMeuDia(filters)

  const itemsDoProduto = useMemo(
    () => items.filter(i => !produtoAtual || i.produto?.toUpperCase() === produtoAtual.toUpperCase()),
    [items, produtoAtual]
  )

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { vencido: 0, hoje: 0, esta_semana: 0, futuro: 0 }
    for (const it of itemsDoProduto) {
      if (it.status_apresentacao in c) c[it.status_apresentacao as Bucket] += 1
    }
    return c
  }, [itemsDoProduto])

  const filtered = useMemo(() => {
    return itemsDoProduto.filter(it => {
      if (it.status_apresentacao !== bucket) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const blob = `${it.titulo} ${it.card_titulo} ${it.descricao ?? ''} ${it.categoria}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [itemsDoProduto, bucket, search])

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; label: string; order: number; items: MeuDiaItem[] }>()
    for (const it of filtered) {
      let key: string, label: string, order = 0
      if (groupBy === 'viagem') {
        key = it.card_id
        label = it.card_titulo
        order = it.data_viagem_inicio ? new Date(it.data_viagem_inicio).getTime() : Number.MAX_SAFE_INTEGER
      } else if (groupBy === 'categoria') {
        key = it.categoria
        const cat = CATEGORIAS_CONCIERGE[it.categoria as keyof typeof CATEGORIAS_CONCIERGE]
        label = cat?.label ?? it.categoria
      } else {
        key = it.status_apresentacao
        label = ({ vencido: 'Vencidos', hoje: 'Hoje', esta_semana: 'Esta semana', futuro: 'Próximas', concluido: 'Concluídos', fechado: 'Fechados' } as Record<StatusApresentacao, string>)[it.status_apresentacao]
      }
      if (!map.has(key)) map.set(key, { key, label, order, items: [] })
      map.get(key)!.items.push(it)
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order)
  }, [filtered, groupBy])

  const todayCloseable = counts.vencido + counts.hoje
  const valorEmJogo = itemsDoProduto
    .filter(i => i.tipo_concierge === 'oferta' && (i.status_apresentacao === 'vencido' || i.status_apresentacao === 'hoje' || i.status_apresentacao === 'esta_semana'))
    .reduce((s, i) => s + (i.valor ?? 0), 0)

  const onMarcarFeito = (item: MeuDiaItem) => marcarOutcome.mutate({ atendimento_id: item.atendimento_id, outcome: 'feito' })
  const onNotificar = (item: MeuDiaItem) => notificarCliente.mutate(item.atendimento_id)

  return (
    <div className="flex h-[calc(100vh-7rem)]">
      <UrgencyRail bucket={bucket} setBucket={setBucket} counts={counts} />

      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar
          search={search} setSearch={setSearch}
          groupBy={groupBy} setGroupBy={setGroupBy}
          tipoFilter={tipoFilter} setTipoFilter={setTipoFilter}
          sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          showAll={showAll} setShowAll={setShowAll}
          count={filtered.length}
          produtoAtual={produtoAtual}
        />

        <div className="flex-1 overflow-auto">
          <div className="px-6 py-4 pb-24 space-y-6">
            {isLoading ? (
              <div className="text-center py-12 text-sm text-slate-500">Carregando fila...</div>
            ) : grouped.length === 0 ? (
              <EmptyBucket bucket={bucket} />
            ) : (
              grouped.map(g => (
                <section key={g.key}>
                  <h3 className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    {g.label}
                    <span className="text-slate-400 font-mono text-[11px]">{g.items.length}</span>
                  </h3>
                  <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-sm overflow-hidden">
                    {g.items.map(it => (
                      <QueueRow
                        key={it.atendimento_id}
                        item={it}
                        onClick={() => setSelected(it)}
                        onMarcarFeito={() => onMarcarFeito(it)}
                        onNotificar={() => onNotificar(it)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>

        <FooterBar todayCloseable={todayCloseable} valorEmJogo={valorEmJogo} />
      </div>

      {selected && (
        <AtendimentoDetailModal
          atendimento={selected as never}
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null) }}
        />
      )}
    </div>
  )
}

function UrgencyRail({ bucket, setBucket, counts }: { bucket: Bucket; setBucket: (b: Bucket) => void; counts: Record<Bucket, number> }) {
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Sua fila</div>
        <div className="text-[13px] text-slate-700 leading-snug">
          {counts.vencido > 0 ? (
            <>Tem <span className="font-semibold text-red-700">{counts.vencido} vencido{counts.vencido === 1 ? '' : 's'}</span>. Começa por aí.</>
          ) : counts.hoje > 0 ? (
            <>{counts.hoje} pra fechar hoje.</>
          ) : (
            <>Tudo em paz. Boa.</>
          )}
        </div>
      </div>

      <nav className="px-3 space-y-0.5">
        {BUCKET_CONFIG.map(({ id, label, Icon, tone }) => {
          const active = bucket === id
          const isVencidoAtivo = id === 'vencido' && counts.vencido > 0
          return (
            <button
              key={id}
              onClick={() => setBucket(id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-[13px] transition-colors text-left',
                active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', active ? 'text-white' : isVencidoAtivo ? 'text-red-600' : 'text-slate-400')} />
              <span className="flex-1 font-medium">{label}</span>
              <span className={cn(
                'font-mono text-[11px] px-1.5 h-5 inline-flex items-center rounded-md',
                active ? 'bg-white/15 text-white' : isVencidoAtivo ? `${tone.bg} ${tone.text} font-semibold` : 'bg-slate-100 text-slate-600'
              )}>
                {counts[id]}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mx-3 my-4 border-t border-slate-200" />

      <div className="px-3">
        <div className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1.5">Atalhos</div>
        <div className="flex items-center gap-2.5 px-2.5 h-8 rounded-md text-[12.5px] text-slate-700 hover:bg-slate-100">
          <span className="flex-1">Pesquisar fila</span>
          <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 font-mono text-[10.5px] text-slate-600 bg-white border border-slate-200 border-b-2 rounded">/</kbd>
        </div>
      </div>

      <div className="mt-auto p-4">
        <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            Dica de fluxo
          </div>
          <p className="text-[11.5px] text-slate-600 leading-snug">
            Resolva vencidos primeiro, depois ataque <em>hoje</em> agrupado por viagem — você toca o cliente uma vez só.
          </p>
        </div>
      </div>
    </aside>
  )
}

interface ToolbarProps {
  search: string; setSearch: (s: string) => void
  groupBy: MeuDiaGroupBy; setGroupBy: (g: MeuDiaGroupBy) => void
  tipoFilter: Set<TipoConcierge>; setTipoFilter: (s: Set<TipoConcierge>) => void
  sourceFilter: Set<SourceConcierge>; setSourceFilter: (s: Set<SourceConcierge>) => void
  showAll: boolean; setShowAll: (b: boolean) => void
  count: number
  produtoAtual: string | null | undefined
}

function Toolbar({ search, setSearch, groupBy, setGroupBy, tipoFilter, setTipoFilter, sourceFilter, setSourceFilter, showAll, setShowAll, count, produtoAtual }: ToolbarProps) {
  const toggleSet = <T,>(set: Set<T>, setter: (s: Set<T>) => void, k: T) => {
    const next = new Set(set)
    if (next.has(k)) next.delete(k); else next.add(k)
    setter(next)
  }

  const _categoriasDoProduto = useMemo(() => categoriasParaProduto(produtoAtual), [produtoAtual])
  void _categoriasDoProduto

  return (
    <div className="border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar viagem, cliente, tarefa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-8 pl-9 pr-9 text-[13px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 font-mono text-[10.5px] text-slate-600 bg-white border border-slate-200 border-b-2 rounded">/</kbd>
        </div>
        <div className="text-[12px] text-slate-500 font-mono">{count} {count === 1 ? 'item' : 'itens'}</div>
        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-slate-500">Agrupar:</span>
          <div className="inline-flex bg-slate-100 rounded-md p-0.5">
            {(['prazo', 'viagem', 'categoria'] as MeuDiaGroupBy[]).map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={cn(
                  'h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                  groupBy === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {g === 'prazo' ? 'Prazo' : g === 'viagem' ? 'Viagem' : 'Categoria'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-slate-500">Ver:</span>
          <div className="inline-flex bg-slate-100 rounded-md p-0.5">
            <button
              onClick={() => setShowAll(false)}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                !showAll ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <UserIcon className="w-3 h-3" />
              Minha fila
            </button>
            <button
              onClick={() => setShowAll(true)}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
                showAll ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Users className="w-3 h-3" />
              Time todo
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 -mb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <span className="text-[11px] text-slate-500 shrink-0">Tipo:</span>
        {(Object.entries(TIPO_LABEL) as [TipoConcierge, typeof TIPO_LABEL[TipoConcierge]][]).map(([key, meta]) => {
          const active = tipoFilter.has(key)
          return (
            <button
              key={key}
              onClick={() => toggleSet(tipoFilter, setTipoFilter, key)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11.5px] font-medium border transition-colors',
                active ? `${meta.bgColor} ${meta.color} ${meta.borderColor}` : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', meta.dotColor)} />
              {meta.label}
            </button>
          )
        })}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <span className="text-[11px] text-slate-500 shrink-0">Origem:</span>
        {(Object.entries(SOURCE_LABEL) as [SourceConcierge, typeof SOURCE_LABEL[SourceConcierge]][]).map(([key, meta]) => {
          const active = sourceFilter.has(key)
          return (
            <button
              key={key}
              onClick={() => toggleSet(sourceFilter, setSourceFilter, key)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11.5px] border transition-colors',
                active ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              <SourceIcon source={key} className="w-3 h-3" />
              {meta.label}
            </button>
          )
        })}

        {(tipoFilter.size > 0 || sourceFilter.size > 0) && (
          <button
            onClick={() => { setTipoFilter(new Set()); setSourceFilter(new Set()) }}
            className="shrink-0 text-[11.5px] text-slate-500 hover:text-slate-700 ml-1"
          >
            limpar
          </button>
        )}
      </div>
    </div>
  )
}

function QueueRow({ item, onClick, onMarcarFeito, onNotificar }: { item: MeuDiaItem; onClick: () => void; onMarcarFeito: () => void; onNotificar: () => void }) {
  const meta = TIPO_LABEL[item.tipo_concierge]
  const cat = CATEGORIAS_CONCIERGE[item.categoria as CategoriaConcierge]
  const isVencido = item.status_apresentacao === 'vencido'

  return (
    <li className="group relative">
      <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', meta.dotColor)} />
      <button
        onClick={onClick}
        className="w-full text-left py-3 pl-4 pr-3 hover:bg-slate-50 transition-colors flex items-start gap-3"
      >
        <div className="pt-0.5 shrink-0">
          <TipoBadge tipo={item.tipo_concierge} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="text-[13.5px] font-semibold text-slate-900 truncate">{item.titulo}</h4>
            {isVencido && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">VENCIDO</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <span className="text-slate-700 font-medium truncate max-w-[260px]">{item.card_titulo}</span>
            <span className="text-slate-300">·</span>
            <span>{cat?.label ?? item.categoria}</span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1">
              <SourceIcon source={item.source} className="w-3 h-3 text-slate-400" />
              {SOURCE_LABEL[item.source].label}
            </span>
          </div>
          {item.descricao && (
            <p className="text-[12px] text-slate-500 mt-1 line-clamp-1">{item.descricao}</p>
          )}
        </div>

        <div className="shrink-0 flex items-start gap-3 pt-0.5">
          {item.valor != null && (
            <div className="text-right">
              <div className="text-[12.5px] font-semibold text-slate-900 font-mono">{fmtBRL(item.valor)}</div>
              <div className="text-[10.5px] text-slate-400 uppercase tracking-wide">valor</div>
            </div>
          )}

          <div className="text-right min-w-[80px]">
            <div className={cn('text-[12px] font-medium font-mono', isVencido ? 'text-red-600' : 'text-slate-700')}>
              {item.data_vencimento ? relTime(item.data_vencimento) : '—'}
            </div>
            <div className="text-[10.5px] text-slate-400 uppercase tracking-wide">prazo</div>
          </div>

          {item.dias_pra_embarque != null && (
            <div className="text-right min-w-[60px]">
              <div className="text-[12px] font-medium text-slate-700 font-mono">
                {item.dias_pra_embarque < 0 ? `+${-item.dias_pra_embarque}d` : `${item.dias_pra_embarque}d`}
              </div>
              <div className="text-[10.5px] text-slate-400 uppercase tracking-wide">embarque</div>
            </div>
          )}

          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onMarcarFeito() }}
              className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-emerald-100 hover:text-emerald-700"
              title="Marcar feito"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onNotificar() }}
              className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-cyan-100 hover:text-cyan-700"
              title="Notificar cliente"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClick() }}
              className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-200"
              title="Mais"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </button>
    </li>
  )
}

function EmptyBucket({ bucket }: { bucket: Bucket }) {
  const map: Record<Bucket, { title: string; sub: string }> = {
    vencido:     { title: 'Nada vencido. Bom trabalho.', sub: 'Quando algo passar do prazo, vai aparecer aqui em primeiro lugar.' },
    hoje:        { title: 'Sem nada pra hoje.',          sub: 'Aproveita pro café — ou adianta da próxima janela.' },
    esta_semana: { title: 'Semana em paz.',              sub: 'Use a aba Em Lote pra processar cadências em massa.' },
    futuro:      { title: 'Sem futuro previsto ainda.',  sub: 'Os modelos de cadência criam atendimentos automaticamente.' },
  }
  const e = map[bucket]
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
      <h3 className="text-[15px] font-semibold text-slate-900 mb-1">{e.title}</h3>
      <p className="text-[13px] text-slate-500 max-w-sm mx-auto">{e.sub}</p>
    </div>
  )
}

function FooterBar({ todayCloseable, valorEmJogo }: { todayCloseable: number; valorEmJogo: number }) {
  return (
    <div className="border-t border-slate-200 bg-white/85 backdrop-blur-md px-6 py-2.5 flex items-center gap-6">
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[11.5px] text-slate-500">Pra fechar hoje</span>
        <span className="font-mono text-[13px] font-semibold text-slate-900">{todayCloseable}</span>
      </div>
      <div className="w-px h-4 bg-slate-200" />
      <div className="flex items-center gap-2">
        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-[11.5px] text-slate-500">Valor em jogo</span>
        <span className="font-mono text-[13px] font-semibold text-emerald-700">{fmtBRL(valorEmJogo)}</span>
      </div>
      <div className="w-px h-4 bg-slate-200" />
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
        <span className="text-[11.5px] text-slate-500">Fila do dia ativa</span>
      </div>
    </div>
  )
}
