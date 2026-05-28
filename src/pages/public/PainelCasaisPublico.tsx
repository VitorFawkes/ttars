import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Phone, Link2, ExternalLink, Copy, Send, History, CheckCircle2, AlertCircle,
  Calendar, Plus, Loader2, Search, Heart, Bell, X, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatPhoneBR } from '../../lib/convidados/formatPhoneBR'
import { buildLinkCasal, buildWhatsappLink } from '../../lib/convidados/buildLink'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const EDGE_URL = `${SUPABASE_URL}/functions/v1/wedding-lista-publica`

interface CasalPainelRow {
  id: string
  codigo: string
  nome_casal: string
  whatsapp_digits: string
  criado_em: string
  ultima_edicao_casal_em: string | null
  enviado_em: string | null
  visto_em: string | null
  total_convites: number
  total_pessoas: number
  pessoas_sem_telefone: number
  total_envios: number
  alterado_depois_do_envio: boolean
}

interface EnvioSnapshot {
  id: string
  enviado_em: string
  snapshot: SnapshotConvite[]
  total_convites: number
  total_pessoas: number
  total_sem_telefone: number
}

interface SnapshotConvite {
  id: string
  nome: string
  pessoas: { id: string; nome_raw: string; telefone_raw: string; faixa: string; lado: string | null; tipo: string | null; observacoes: string | null }[]
}

async function callEdge<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body as T
}

function useEnableNativeScroll() {
  useEffect(() => {
    const html = document.documentElement, body = document.body, root = document.getElementById('root')
    const prev = { ho: html.style.overflow, hh: html.style.height, bo: body.style.overflow, bh: body.style.height, ro: root?.style.overflow, rh: root?.style.height }
    html.style.overflow = 'auto'; html.style.height = 'auto'
    body.style.overflow = 'visible'; body.style.height = 'auto'
    if (root) { root.style.overflow = 'visible'; root.style.height = 'auto' }
    return () => {
      html.style.overflow = prev.ho; html.style.height = prev.hh
      body.style.overflow = prev.bo; body.style.height = prev.bh
      if (root) { root.style.overflow = prev.ro || ''; root.style.height = prev.rh || '' }
    }
  }, [])
}

export default function PainelCasaisPublico() {
  useEnableNativeScroll()
  const [search, setSearch] = useState('')
  const [historicoCasal, setHistoricoCasal] = useState<CasalPainelRow | null>(null)

  const { data: casais = [], isLoading } = useQuery<CasalPainelRow[]>({
    queryKey: ['painel-casais-publico'],
    queryFn: () => callEdge<CasalPainelRow[]>({ action: 'listar_casais_publico', codigo: 'PUBLIC' }),
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
  })

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return casais
    return casais.filter((c) =>
      c.nome_casal.toLowerCase().includes(q) ||
      c.codigo.toLowerCase().includes(q) ||
      c.whatsapp_digits.includes(q.replace(/\D/g, '')),
    )
  }, [casais, search])

  const totais = useMemo(
    () => casais.reduce(
      (acc, c) => {
        acc.casais++
        acc.convites += c.total_convites
        acc.convidados += c.total_pessoas
        if (c.alterado_depois_do_envio) acc.pendentes++
        return acc
      },
      { casais: 0, convites: 0, convidados: 0, pendentes: 0 },
    ),
    [casais],
  )

  return (
    <div
      className="min-h-screen font-ww-display"
      style={{
        background: 'linear-gradient(135deg, rgba(189,150,92,0.07) 0%, #FBF8F4 45%, rgba(234,167,148,0.06) 100%)',
      }}
    >
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-ww-sand px-6 py-3">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <img src="/brand/ww/welcome-weddings-horizontal.png" alt="Welcome Weddings" className="h-8 w-auto object-contain" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ww-gold">Painel · Casais cadastrados</p>
              <h1 className="font-ww-serif italic text-[22px] text-ww-n700 leading-tight">Welcome Weddings</h1>
            </div>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <TotalChip n={totais.casais} label="casais" />
            <TotalChip n={totais.convites} label="convites" />
            <TotalChip n={totais.convidados} label="convidados" accent />
            {totais.pendentes > 0 && <TotalChip n={totais.pendentes} label="atualizou depois" warn />}
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-6 py-6 pb-24">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex-1 relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ww-n400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, código ou WhatsApp..."
              className="w-full pl-9 pr-3 h-9 text-sm border border-ww-sand-dk bg-white rounded-full focus:outline-none focus:ring-2 focus:ring-ww-gold/30 focus:border-ww-gold"
            />
          </div>
          <Link
            to="/cadastrar-casal"
            className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Cadastrar novo casal
          </Link>
        </div>

        {isLoading ? (
          <div className="text-center py-10 text-sm text-ww-n500">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando casais…
          </div>
        ) : casais.length === 0 ? (
          <EmptyState />
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-ww-n500 text-center py-10">Nenhum casal corresponde à busca.</p>
        ) : (
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {filtrados.map((casal) => (
              <CasalPainelCard key={casal.id} casal={casal} onAbrirHistorico={() => setHistoricoCasal(casal)} />
            ))}
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-10 bg-white/95 backdrop-blur border-t border-ww-sand px-6 py-2 text-[11px] text-ww-n500 text-center">
        Painel público · acesso sem login. Edição completa (excluir, editar, vincular a casamento) só pelo CRM interno.
      </footer>

      {historicoCasal && (
        <HistoricoModal casal={historicoCasal} onClose={() => setHistoricoCasal(null)} />
      )}
    </div>
  )
}

function TotalChip({ n, label, accent, warn }: { n: number; label: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="inline-flex flex-col items-end">
      <strong
        className={cn(
          'tabular-nums text-lg leading-none',
          warn ? 'text-amber-700' : accent ? 'text-ww-gold-ink' : 'text-ww-n700',
        )}
      >
        {n}
      </strong>
      <span className="text-[10px] uppercase tracking-wider text-ww-n500 mt-0.5">{label}</span>
    </div>
  )
}

function CasalPainelCard({ casal, onAbrirHistorico }: { casal: CasalPainelRow; onAbrirHistorico: () => void }) {
  const [copied, setCopied] = useState(false)
  const link = buildLinkCasal(casal.codigo)
  const wa = buildWhatsappLink(casal.whatsapp_digits, casal.codigo)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  const nuncaEnviou = !casal.enviado_em
  const alteradoDepois = casal.alterado_depois_do_envio
  const semTel = casal.pessoas_sem_telefone > 0

  const status = alteradoDepois
    ? { label: 'Atualizou depois', cls: 'bg-amber-100 text-amber-900 border-amber-300', alert: true }
    : nuncaEnviou && casal.total_pessoas === 0
      ? { label: 'Não iniciado', cls: 'bg-slate-50 text-ww-n500 border-ww-sand', alert: false }
      : nuncaEnviou
        ? { label: 'Em preenchimento', cls: 'bg-sky-50 text-sky-700 border-sky-200', alert: false }
        : semTel
          ? { label: `${casal.pessoas_sem_telefone} sem telefone`, cls: 'bg-rose-50 text-rose-700 border-rose-200', alert: false }
          : { label: 'Lista enviada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', alert: false }

  return (
    <article
      className={cn(
        'bg-white border rounded-xl p-5 shadow-sm hover:shadow-ww-lift hover:-translate-y-0.5 transition-all duration-200 ease-ww-soft flex flex-col gap-3',
        alteradoDepois ? 'border-amber-400 ring-2 ring-amber-200' : 'border-ww-sand',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ww-gold mb-1">♥ Casal</p>
          <h3 className="font-ww-serif italic text-xl text-ww-n700 leading-tight">{casal.nome_casal}</h3>
        </div>
        {casal.total_envios > 0 && (
          <button
            type="button"
            onClick={onAbrirHistorico}
            className="p-1.5 rounded text-ww-n500 hover:text-ww-gold-ink hover:bg-ww-cream"
            title="Histórico de envios"
          >
            <History className="w-4 h-4" />
          </button>
        )}
      </header>

      {alteradoDepois && (
        <button
          type="button"
          onClick={onAbrirHistorico}
          className="-mx-1 -mt-1 px-2.5 py-1.5 bg-amber-100/80 border border-amber-300 rounded-md text-left hover:bg-amber-100 transition-colors flex items-center gap-1.5"
        >
          <Bell className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span className="text-[11px] text-amber-900 font-medium leading-tight">
            O casal editou depois do último envio. Clique para ver o que mudou.
          </span>
        </button>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="col-span-2">
          <dt className="text-ww-n500 uppercase tracking-wider text-[10px] mb-0.5">Código</dt>
          <dd>
            <code className="inline-block font-mono text-[12px] bg-ww-gold-soft text-ww-gold-ink px-2 py-0.5 rounded whitespace-nowrap">{casal.codigo}</code>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ww-n500 uppercase tracking-wider text-[10px] mb-0.5">WhatsApp</dt>
          <dd className="inline-flex items-center gap-1.5 text-ww-n700">
            <Phone className="w-3 h-3 text-ww-n400" />+55 {formatPhoneBR(casal.whatsapp_digits)}
          </dd>
        </div>
        {casal.enviado_em && (
          <div className="col-span-2">
            <dt className="text-ww-n500 uppercase tracking-wider text-[10px] mb-0.5">Último envio</dt>
            <dd className="text-xs text-ww-n700 inline-flex items-center gap-1">
              <Calendar className="w-3 h-3 text-ww-n400" />
              {new Date(casal.enviado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {casal.total_envios > 1 && <span className="text-ww-n400 ml-1">· {casal.total_envios} versões</span>}
            </dd>
          </div>
        )}
      </dl>

      <div className="flex items-center justify-between gap-2 py-2 border-y border-dashed border-ww-sand text-xs">
        <Stat n={casal.total_convites} label="convites" />
        <Stat n={casal.total_pessoas} label="convidados" accent />
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide', status.cls)}>
          {status.alert && <Bell className="w-2.5 h-2.5" />}
          {status.label}
        </span>
      </div>

      <div className="bg-ww-paper border border-ww-sand rounded-md px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] text-ww-n500 min-w-0">
        <Link2 className="w-3 h-3 shrink-0 text-ww-gold" />
        <code className="font-mono text-[10.5px] truncate flex-1">{link}</code>
      </div>

      <footer className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'flex-1 inline-flex items-center justify-center gap-1.5 px-2 h-8 text-xs font-medium rounded-md border transition-colors',
            copied
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-white border-ww-sand text-ww-n600 hover:bg-ww-cream',
          )}
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-2.5 h-8 text-xs font-medium rounded-md bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Enviar
          </a>
        )}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-2.5 h-8 text-xs font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Abrir lista
        </a>
      </footer>
    </article>
  )
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className="inline-flex items-baseline gap-1">
      <strong className={cn('tabular-nums font-semibold', accent ? 'text-ww-gold-ink text-base' : 'text-ww-n700 text-sm')}>{n}</strong>
      <span className="text-ww-n500 text-[11px]">{label}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white border border-dashed border-ww-sand rounded-xl py-12 text-center max-w-md mx-auto">
      <Heart className="w-10 h-10 mx-auto text-ww-gold mb-3" />
      <p className="text-ww-n700 font-medium mb-1">Nenhum casal cadastrado ainda.</p>
      <p className="text-sm text-ww-n500 mb-4">Cadastre o primeiro para gerar um link de lista.</p>
      <Link
        to="/cadastrar-casal"
        className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium rounded-md bg-ww-gold text-white hover:bg-ww-gold-ink transition-colors"
      >
        <Plus className="w-4 h-4" /> Cadastrar o primeiro
      </Link>
    </div>
  )
}

// ── Histórico modal ─────────────────────────────────────────────────────

function HistoricoModal({ casal, onClose }: { casal: CasalPainelRow; onClose: () => void }) {
  const qc = useQueryClient()
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const { data: envios = [], isLoading } = useQuery<EnvioSnapshot[]>({
    queryKey: ['envios-publico', casal.id],
    queryFn: () => callEdge<EnvioSnapshot[]>({ action: 'envios_publico', codigo: 'PUBLIC', casal_id: casal.id }),
  })

  const marcarVisto = useMutation({
    mutationFn: () => callEdge<{ ok: boolean }>({ action: 'marcar_visto_publico', codigo: 'PUBLIC', casal_id: casal.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['painel-casais-publico'] })
    },
  })

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(33,31,29,0.42)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[720px] max-h-[90vh] bg-white rounded-xl shadow-ww-modal flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ww-sand">
          <div>
            <h2 className="font-ww-serif italic text-lg text-ww-n700">Histórico de envios</h2>
            <p className="text-xs text-ww-n500 mt-0.5">
              Cada vez que <strong className="text-ww-n700">{casal.nome_casal}</strong> apertou "Pronto" geramos uma foto da lista.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-ww-cream text-ww-n500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="text-center py-10 text-sm text-ww-n500">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
            </div>
          ) : envios.length === 0 ? (
            <div className="text-center py-10 text-sm text-ww-n500">O casal ainda não clicou em "Pronto".</div>
          ) : (
            <ol className="flex flex-col gap-3">
              {envios.map((envio, idx) => {
                const previo = envios[idx + 1] ?? null
                const isMaisRecente = idx === 0
                const isExpanded = expandedIdx === idx
                return (
                  <li key={envio.id} className={cn('border rounded-lg', isMaisRecente ? 'border-ww-gold/60 bg-ww-gold-soft/30' : 'border-ww-sand bg-white')}>
                    <button
                      type="button"
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-ww-n500" /> : <ChevronRight className="w-4 h-4 text-ww-n500" />}
                        <div>
                          <p className="text-sm font-medium text-ww-n700">
                            {isMaisRecente && (
                              <span className="inline-block mr-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-ww-gold text-white rounded">Versão atual</span>
                            )}
                            Envio #{envios.length - idx} — {new Date(envio.enviado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-xs text-ww-n500 mt-0.5">
                            {envio.total_convites} convites · {envio.total_pessoas} pessoas
                            {envio.total_sem_telefone > 0 && (<span className="text-rose-600"> · {envio.total_sem_telefone} sem telefone</span>)}
                          </p>
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-ww-sand px-4 py-3 bg-white/60 text-xs text-ww-n500">
                        {previo ? (
                          <DiffLite previo={previo} atual={envio} />
                        ) : (
                          <p className="italic">Esta é a primeira versão enviada.</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ww-sand">
          {casal.alterado_depois_do_envio && (
            <button
              type="button"
              onClick={() => marcarVisto.mutate()}
              disabled={marcarVisto.isPending}
              className="inline-flex items-center gap-1.5 px-3 h-9 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {marcarVisto.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Marcar como verificado
            </button>
          )}
          <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-ww-n600 hover:text-ww-n700">Fechar</button>
        </footer>
      </div>
    </div>
  )
}

function DiffLite({ previo, atual }: { previo: EnvioSnapshot; atual: EnvioSnapshot }) {
  const mPrev = new Map<string, SnapshotConvite['pessoas'][number]>()
  const mAtu = new Map<string, SnapshotConvite['pessoas'][number]>()
  for (const c of previo.snapshot || []) for (const p of c.pessoas || []) mPrev.set(p.id, p)
  for (const c of atual.snapshot || []) for (const p of c.pessoas || []) mAtu.set(p.id, p)

  const adicionadas: typeof previo.snapshot[number]['pessoas'] = []
  const removidas: typeof previo.snapshot[number]['pessoas'] = []
  for (const [id, p] of mAtu) if (!mPrev.has(id)) adicionadas.push(p)
  for (const [id, p] of mPrev) if (!mAtu.has(id)) removidas.push(p)

  if (adicionadas.length === 0 && removidas.length === 0) {
    return <p className="italic">Sem novas pessoas / removidas (pode ter havido edições).</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {adicionadas.length > 0 && (
        <div>
          <strong className="text-emerald-700">+ Adicionados ({adicionadas.length})</strong>
          <ul className="ml-3 mt-1">
            {adicionadas.map((p) => <li key={p.id} className="text-ww-n600">{p.nome_raw || '(sem nome)'} <span className="text-ww-n400">— {p.faixa}</span></li>)}
          </ul>
        </div>
      )}
      {removidas.length > 0 && (
        <div>
          <strong className="text-rose-600">− Removidos ({removidas.length})</strong>
          <ul className="ml-3 mt-1">
            {removidas.map((p) => <li key={p.id} className="text-ww-n600"><span className="line-through">{p.nome_raw || '(sem nome)'}</span> <span className="text-ww-n400">— {p.faixa}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// Suppress unused imports (AlertCircle reservado pra future)
void AlertCircle
