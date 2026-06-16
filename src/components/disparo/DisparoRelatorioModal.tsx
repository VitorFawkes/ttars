import { useEffect, useMemo, useState } from 'react'
import { X, Ban, Loader2, Download, ChevronDown, Send, Zap, SlidersHorizontal, Play, Pause } from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatPhoneBR } from '../../utils/normalizePhone'
import { useDisparoFila } from '../../hooks/disparo/useDisparos'
import { useDisparoActions } from '../../hooks/disparo/useDisparoActions'
import type { DisparoCampanha, DisparoFilaItem, DisparoFilaStatus } from '../../hooks/disparo/types'
import { derivarPorDia, intervaloEmMin } from './ritmo'

interface Props {
  open: boolean
  campanha: DisparoCampanha
  onClose: () => void
}

/** Data + hora curtas no fuso BR (ex.: "05/06 14:32"). */
function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(iso))
  } catch { return '' }
}

/** Hora atual (0–23) no fuso BR — pra avisar envio fora da janela 8h–20h. */
function horaBR(): number {
  return parseInt(
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()),
    10,
  )
}

/** Intervalo em minutos → texto curto ("30 min" / "2 h"). */
function fmtIntervalo(min: number): string {
  if (min >= 60 && min % 60 === 0) return `${min / 60} h`
  return `${min} min`
}

function csvCell(v: string): string {
  const s = v ?? ''
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const STATUS_LABEL: Record<DisparoFilaStatus, { label: string; cls: string }> = {
  sent:       { label: 'Enviada',   cls: 'text-ww-success' },
  pending:    { label: 'Na fila',   cls: 'text-ww-n500' },
  processing: { label: 'Enviando',  cls: 'text-ww-gold-ink' },
  failed:     { label: 'Falhou',    cls: 'text-ww-error' },
  opt_out:    { label: 'Saiu',      cls: 'text-ww-olive-ink' },
  cancelado:  { label: 'Cancelada', cls: 'text-ww-n400' },
}

const FILTERS: { key: 'all' | DisparoFilaStatus; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'sent', label: 'Enviadas' },
  { key: 'pending', label: 'Na fila' },
  { key: 'failed', label: 'Falhas' },
  { key: 'opt_out', label: 'Saíram' },
]

export function DisparoRelatorioModal({ open, campanha, onClose }: Props) {
  const campaignId = campanha.id
  const titulo = campanha.titulo
  const { data: itens = [], isLoading } = useDisparoFila(open ? campaignId : null)
  const { marcarOptOut, enviarAgora, ajustarRitmo, pausar, retomar } = useDisparoActions()
  const [filter, setFilter] = useState<'all' | DisparoFilaStatus>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [proximosN, setProximosN] = useState(10)

  // "Mudar ritmo" — form inline, semeado da campanha
  const [ritmoOpen, setRitmoOpen] = useState(false)
  const [rTam, setRTam] = useState(campanha.tamanho_leva ?? 10)
  const [rValor, setRValor] = useState(30)
  const [rUnidade, setRUnidade] = useState<'min' | 'h'>('min')

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  const toggleSel = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  const baixarCsv = () => {
    const header = ['Nome', 'Telefone', 'Status', 'Agendada para', 'Enviada em', 'Tentativas', 'Mensagem enviada', 'Erro']
    const linhas = itens.map((i) => [
      i.contato?.nome ?? '',
      formatPhoneBR(i.telefone_normalizado),
      STATUS_LABEL[i.status].label,
      fmtDateTime(i.execute_at),
      fmtDateTime(i.enviado_at),
      String(i.attempts ?? 0),
      i.corpo_renderizado ?? '',
      i.erro_motivo ?? '',
    ])
    const csv = '﻿' + [header, ...linhas].map((r) => r.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `disparo-${titulo.replace(/[^\w-]+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) { setShown(false); setSel(new Set()); setRitmoOpen(false); return }
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  // Semeia o form de ritmo quando abre / quando a campanha muda
  useEffect(() => {
    if (!open) return
    setRTam(campanha.tamanho_leva ?? 10)
    const min = campanha.intervalo_leva_min ?? 30
    if (min >= 60 && min % 60 === 0) { setRUnidade('h'); setRValor(min / 60) }
    else { setRUnidade('min'); setRValor(min) }
  }, [open, campanha.tamanho_leva, campanha.intervalo_leva_min])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of itens) c[i.status] = (c[i.status] ?? 0) + 1
    return c
  }, [itens])

  const enviados = counts['sent'] ?? 0
  const faltam = (counts['pending'] ?? 0) + (counts['processing'] ?? 0)
  const falhas = counts['failed'] ?? 0
  const saidos = counts['opt_out'] ?? 0
  // itens vêm ordenados por execute_at ASC → 1ª pendente = próxima a sair
  const proxima = itens.find((i) => i.status === 'pending')?.execute_at ?? null

  const filtered = useMemo(
    () => (filter === 'all' ? itens : itens.filter((i) => i.status === filter)),
    [itens, filter],
  )
  const pendentesVisiveis = filtered.filter((i) => i.status === 'pending')

  const ativo = campanha.status === 'agendado' || campanha.status === 'disparando'
  const rIntervaloMin = intervaloEmMin(rValor, rUnidade)
  const rPorDia = derivarPorDia(rTam, rIntervaloMin)

  const handleOptOut = async (item: DisparoFilaItem) => {
    setBusyId(item.id)
    try { await marcarOptOut(campaignId, item.contact_id) } finally { setBusyId(null) }
  }

  const foraJanela = () => { const h = horaBR(); return h < 8 || h >= 20 }

  const enviarProximos = async () => {
    if (faltam === 0 || busy) return
    const n = Math.min(Math.max(proximosN, 1), faltam)
    if (n > 30 && !window.confirm(`Enviar ${n} de uma vez agora? Pra proteger o número, o ideal são levas menores.`)) return
    if (foraJanela() && !window.confirm('Agora está fora do horário recomendado (8h às 20h). Enviar mesmo assim?')) return
    setBusy(true)
    try { await enviarAgora(campaignId, { proximosN: n }) } finally { setBusy(false) }
  }

  const enviarSelecionados = async () => {
    if (sel.size === 0 || busy) return
    if (sel.size > 30 && !window.confirm(`Enviar ${sel.size} de uma vez agora? Pra proteger o número, o ideal são levas menores.`)) return
    if (foraJanela() && !window.confirm('Agora está fora do horário recomendado (8h às 20h). Enviar mesmo assim?')) return
    setBusy(true)
    try { await enviarAgora(campaignId, { filaIds: [...sel] }); setSel(new Set()) } finally { setBusy(false) }
  }

  const salvarRitmo = async () => {
    if (busy) return
    setBusy(true)
    try {
      await ajustarRitmo(campaignId, { tamanhoLeva: rTam, intervaloMin: rIntervaloMin, capDiario: rPorDia, usarRamp: campanha.usar_ramp })
      setRitmoOpen(false)
    } finally { setBusy(false) }
  }

  const togglePausa = async () => {
    if (busy) return
    setBusy(true)
    try { await (campanha.status === 'pausado' ? retomar(campaignId) : pausar(campaignId)) } finally { setBusy(false) }
  }

  if (!open) return null

  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-ww-n700/35 backdrop-blur-sm p-4 transition-opacity duration-200 ease-ww-soft', shown ? 'opacity-100' : 'opacity-0')}
      onClick={onClose}
    >
      <div
        className={cn('bg-ww-paper rounded-2xl border border-ww-sand shadow-ww-modal w-full max-w-3xl max-h-[88vh] flex flex-col origin-center transition-[transform,opacity] duration-200 ease-ww-soft', shown ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between px-7 py-5 border-b border-ww-sand">
          <div className="min-w-0">
            <h2 className="font-ww-serif text-2xl leading-none text-ww-n700 truncate">{titulo}</h2>
            <p className="mt-1.5 text-sm text-ww-n500">Acompanhe, envie levas na hora e ajuste o ritmo.</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button" onClick={baixarCsv} disabled={itens.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-ww-n600 bg-white border border-ww-sand rounded-lg hover:bg-ww-cream active:scale-[0.97] transition-[transform,background-color] duration-150 ease-ww-soft disabled:opacity-50"
            ><Download className="w-3.5 h-3.5" /> Baixar</button>
            <button onClick={onClose} className="text-ww-n400 hover:text-ww-n700 rounded-lg p-1 transition-colors duration-150"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Resumo: enviados / faltam + ritmo + controles */}
        <div className="px-7 py-4 border-b border-ww-sand/70 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-4">
            <div className="flex items-baseline gap-1.5">
              <span className="font-ww-serif text-3xl text-ww-success tabular-nums leading-none">{enviados}</span>
              <span className="text-sm text-ww-n500">enviados</span>
            </div>
            <span className="text-ww-n300">·</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-ww-serif text-3xl text-ww-n700 tabular-nums leading-none">{faltam}</span>
              <span className="text-sm text-ww-n500">faltam</span>
            </div>
            {falhas > 0 && <span className="text-xs text-ww-error self-center">· {falhas} falhas</span>}
            {saidos > 0 && <span className="text-xs text-ww-olive-ink self-center">· {saidos} saíram</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button" onClick={() => setRitmoOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-ww-n600 bg-white border border-ww-sand rounded-lg hover:bg-ww-cream active:scale-[0.97] transition-[transform,background-color] duration-150 ease-ww-soft"
            ><SlidersHorizontal className="w-3.5 h-3.5" /> Mudar ritmo</button>
            {(ativo || campanha.status === 'pausado') && (
              <button
                type="button" onClick={togglePausa} disabled={busy}
                className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-ww-n600 bg-white border border-ww-sand rounded-lg hover:bg-ww-cream active:scale-[0.97] transition-[transform,background-color] duration-150 ease-ww-soft disabled:opacity-50"
              >
                {campanha.status === 'pausado' ? <><Play className="w-3.5 h-3.5" /> Retomar</> : <><Pause className="w-3.5 h-3.5" /> Pausar</>}
              </button>
            )}
          </div>
        </div>

        {/* Linha de contexto do ritmo + próxima saída */}
        <div className="px-7 py-2.5 border-b border-ww-sand/70 text-xs text-ww-n500 flex items-center gap-2 flex-wrap">
          <span>Ritmo: <span className="font-semibold text-ww-n700">{campanha.tamanho_leva ?? 10}</span> a cada <span className="font-semibold text-ww-n700">{fmtIntervalo(campanha.intervalo_leva_min ?? 30)}</span></span>
          {faltam > 0 && proxima && (
            <>
              <span className="text-ww-n300">·</span>
              <span>próxima saída <span className="font-semibold text-ww-n700">{fmtDateTime(proxima)}</span></span>
            </>
          )}
          {campanha.status === 'pausado' && <span className="text-ww-olive-ink">· pausado</span>}
        </div>

        {/* Form "Mudar ritmo" */}
        {ritmoOpen && (
          <div className="px-7 py-4 border-b border-ww-sand/70 bg-ww-cream/40">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-ww-n600">Manda</span>
              <input
                type="number" min={1} max={500} value={rTam}
                onChange={(e) => setRTam(Math.max(1, parseInt(e.target.value || '1', 10)))}
                className="w-16 h-9 px-2.5 text-sm text-center rounded-lg border border-ww-sand bg-white text-ww-n700 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25"
              />
              <span className="text-ww-n600">{rTam === 1 ? 'pessoa' : 'pessoas'} a cada</span>
              <input
                type="number" min={1} max={999} value={rValor}
                onChange={(e) => setRValor(Math.max(1, parseInt(e.target.value || '1', 10)))}
                className="w-16 h-9 px-2.5 text-sm text-center rounded-lg border border-ww-sand bg-white text-ww-n700 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25"
              />
              <select
                value={rUnidade}
                onChange={(e) => setRUnidade(e.target.value as 'min' | 'h')}
                className="h-9 px-2.5 text-sm rounded-lg border border-ww-sand bg-white text-ww-n700 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25"
              >
                <option value="min">min</option>
                <option value="h">horas</option>
              </select>
              <button
                type="button" onClick={salvarRitmo} disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 text-xs font-semibold text-white bg-ww-gold rounded-lg hover:bg-ww-gold-ink active:scale-[0.97] transition-[transform,background-color] duration-150 ease-ww-soft disabled:opacity-50"
              >{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Aplicar</button>
            </div>
            <p className={cn('mt-2 text-xs', rPorDia > 200 ? 'text-ww-rosewood' : rPorDia > 80 ? 'text-ww-olive-ink' : 'text-ww-n400')}>
              ≈ {rPorDia} por dia{rPorDia > 80 ? ' · ritmo alto pode aumentar o risco de bloqueio' : ''}. Vale pra quem ainda não recebeu.
            </p>
          </div>
        )}

        {/* Barra "enviar agora" */}
        {faltam > 0 && (
          <div className="px-7 py-3 border-b border-ww-sand/70 bg-white flex items-center gap-3 flex-wrap">
            <Zap className="w-4 h-4 text-ww-gold shrink-0" />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ww-n600">Enviar os próximos</span>
              <input
                type="number" min={1} max={faltam} value={proximosN}
                onChange={(e) => setProximosN(Math.max(1, parseInt(e.target.value || '1', 10)))}
                className="w-16 h-9 px-2.5 text-sm text-center rounded-lg border border-ww-sand bg-white text-ww-n700 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25"
              />
              <button
                type="button" onClick={enviarProximos} disabled={busy}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-semibold text-white bg-ww-gold rounded-lg hover:bg-ww-gold-ink active:scale-[0.97] transition-[transform,background-color] duration-150 ease-ww-soft disabled:opacity-50"
              >{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} agora</button>
            </div>
            {sel.size > 0 && (
              <button
                type="button" onClick={enviarSelecionados} disabled={busy}
                className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 text-xs font-semibold text-ww-gold-ink bg-ww-gold-soft border border-ww-gold/25 rounded-lg hover:bg-ww-gold/15 active:scale-[0.97] transition-[transform,background-color] duration-150 ease-ww-soft disabled:opacity-50"
              ><Send className="w-3.5 h-3.5" /> Enviar {sel.size} selecionados agora</button>
            )}
          </div>
        )}

        {/* Filtros */}
        <div className="px-7 py-3 border-b border-ww-sand/70 flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => {
            const n = f.key === 'all' ? itens.length : counts[f.key] ?? 0
            return (
              <button
                key={f.key} type="button" onClick={() => setFilter(f.key)}
                className={cn('inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-full border transition-[background-color,color,transform] duration-150 ease-ww-soft active:scale-[0.97]',
                  filter === f.key ? 'bg-ww-gold text-white border-ww-gold shadow-ww-lift' : 'bg-white text-ww-n600 border-ww-sand hover:bg-ww-cream')}
              >{f.label}<span className="tabular-nums opacity-80">{n}</span></button>
            )
          })}
          {pendentesVisiveis.length > 0 && (
            <button
              type="button"
              onClick={() => setSel((prev) => prev.size >= pendentesVisiveis.length ? new Set() : new Set(pendentesVisiveis.map((i) => i.id)))}
              className="ml-auto text-xs font-semibold text-ww-gold-ink hover:text-ww-gold transition-colors"
            >{sel.size >= pendentesVisiveis.length ? 'Limpar seleção' : 'Selecionar pendentes da lista'}</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-ww-n500">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-ww-n500">Nada aqui.</div>
          ) : (
            <div className="divide-y divide-ww-sand/60">
              {filtered.map((i) => {
                const meta = STATUS_LABEL[i.status]
                const nome = i.contato?.nome?.trim() || 'Sem nome'
                const quando = i.status === 'sent'
                  ? (i.enviado_at ? `Enviada ${fmtDateTime(i.enviado_at)}` : 'Enviada')
                  : i.status === 'pending'
                    ? (i.execute_at ? `Agendada p/ ${fmtDateTime(i.execute_at)}` : 'Na fila')
                    : i.status === 'processing' ? 'Enviando agora'
                      : i.enviado_at ? fmtDateTime(i.enviado_at) : ''
                const isOpen = expanded.has(i.id)
                const temMsg = !!i.corpo_renderizado
                const podeSelecionar = i.status === 'pending'
                return (
                  <div key={i.id} className="px-7 py-3">
                    <div className="flex items-center gap-3 text-sm">
                      {podeSelecionar && (
                        <input
                          type="checkbox" className="accent-ww-gold shrink-0"
                          checked={sel.has(i.id)} onChange={() => toggleSel(i.id)}
                          title="Selecionar pra enviar agora"
                        />
                      )}
                      <button
                        type="button" onClick={() => temMsg && toggleExpand(i.id)}
                        className={cn('flex-1 min-w-0 text-left flex items-start gap-2', temMsg ? 'cursor-pointer group' : 'cursor-default')}
                      >
                        {temMsg && (
                          <ChevronDown className={cn('w-3.5 h-3.5 mt-1 shrink-0 text-ww-n400 transition-transform duration-150', isOpen && 'rotate-180')} />
                        )}
                        <div className="min-w-0">
                          <div className="text-ww-n700 font-medium truncate group-hover:text-ww-gold-ink transition-colors">{nome}</div>
                          <div className="text-xs text-ww-n400 tabular-nums">
                            {formatPhoneBR(i.telefone_normalizado)}{quando ? ` · ${quando}` : ''}
                          </div>
                          {i.erro_motivo && i.status === 'failed' && (
                            <div className="text-xs text-ww-error/80 mt-0.5">{i.erro_motivo}</div>
                          )}
                        </div>
                      </button>
                      <span className={cn('text-xs font-semibold shrink-0', meta.cls)}>{meta.label}</span>
                      {(i.status === 'pending' || i.status === 'sent') && (
                        <button
                          type="button" title="Marcar que pediu pra sair" onClick={() => handleOptOut(i)} disabled={busyId === i.id}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-ww-sand text-ww-n400 hover:text-ww-olive-ink hover:border-ww-olive/30 hover:bg-ww-olive-soft active:scale-[0.96] transition-[transform,background-color,color] duration-150 ease-ww-soft disabled:opacity-50 shrink-0"
                        >{busyId === i.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}</button>
                      )}
                    </div>
                    {isOpen && temMsg && (
                      <div className="mt-2 ml-[22px] rounded-xl border border-ww-sand bg-ww-cream/50 px-3.5 py-2.5 text-sm text-ww-n700 whitespace-pre-wrap leading-relaxed">
                        {i.corpo_renderizado}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
