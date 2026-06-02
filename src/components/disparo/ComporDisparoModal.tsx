import { useCallback, useMemo, useRef, useState } from 'react'
import { X, Send, Upload, ClipboardPaste, AlertTriangle, Loader2, Heart, Users, CheckCircle2, Plus, Ban } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWhatsAppLinhas, isOfficialMetaLine } from '../../hooks/useWhatsAppLinhas'
import { useWeddingsWithGuestCounts } from '../../hooks/convidados/useWeddingsWithGuestCounts'
import { useGuests } from '../../hooks/convidados/useGuests'
import { useDisparoActions } from '../../hooks/disparo/useDisparoActions'
import type { IngestResult, IngestRow } from '../../hooks/disparo/types'
import {
  parsePastedLista,
  parseFileLista,
  guessColumns,
  slugifyHeader,
  type ParsedLista,
} from './parseListaDisparo'

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'lista' | 'casamento'

/** Estima quantos dias o disparo leva, replicando o ramp do servidor. */
function estimarDias(n: number, cap: number, ramp: boolean): number {
  if (n <= 0) return 0
  let remaining = n
  let day = 1
  let dias = 0
  while (remaining > 0 && dias < 365) {
    const c = !ramp ? cap : day === 1 ? Math.min(cap, 100) : day === 2 ? Math.min(cap, 200) : cap
    remaining -= Math.max(c, 1)
    dias++
    day++
  }
  return dias
}

const MOTIVO_LABEL: Record<string, string> = {
  telefone_invalido: 'telefone inválido',
  opt_out: 'pediu pra não receber',
  duplicado: 'repetido na lista',
}

export function ComporDisparoModal({ open, onClose }: Props) {
  const { data: linhas = [] } = useWhatsAppLinhas('WEDDING')
  const { criarCampanha, ingestRecipients, calcularAgenda, cancelar } = useDisparoActions()

  // ── Composição ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('lista')
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState<string>('')
  const [capDiario, setCapDiario] = useState(500)
  const [usarRamp, setUsarRamp] = useState(true)
  const corpoRef = useRef<HTMLTextAreaElement>(null)

  // Lista colada/importada
  const [parsed, setParsed] = useState<ParsedLista>({ headers: [], rows: [] })
  const [telCol, setTelCol] = useState<string | null>(null)
  const [nomeCol, setNomeCol] = useState<string | null>(null)

  // Casamento (escolher do CRM)
  const { data: weddings = [] } = useWeddingsWithGuestCounts()
  const [weddingId, setWeddingId] = useState<string>('')
  const { data: guests = [] } = useGuests(weddingId || null)
  const [guestIds, setGuestIds] = useState<Set<string>>(new Set())

  // ── Revisão / disparo ────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [results, setResults] = useState<IngestResult[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const linhaSelecionada = useMemo(
    () => linhas.find((l) => l.phone_number_id === phoneNumberId) ?? null,
    [linhas, phoneNumberId],
  )
  const linhaOficial = isOfficialMetaLine(phoneNumberId)

  // Variáveis disponíveis (nome + colunas da lista, exceto tel/nome)
  const variaveis = useMemo(() => {
    const base = ['nome']
    if (tab === 'lista') {
      for (const h of parsed.headers) {
        if (h === telCol || h === nomeCol) continue
        const slug = slugifyHeader(h)
        if (slug !== 'nome' && !base.includes(slug)) base.push(slug)
      }
    }
    return base
  }, [tab, parsed.headers, telCol, nomeCol])

  // Telefones / destinatários "estimados" (antes do ingest dedup/match)
  const recipientCount = useMemo(() => {
    if (tab === 'lista') return telCol ? parsed.rows.filter((r) => (r[telCol] ?? '').trim() !== '').length : 0
    return guestIds.size
  }, [tab, telCol, parsed.rows, guestIds])

  const reset = useCallback(() => {
    setTab('lista'); setTitulo(''); setCorpo(''); setPhoneNumberId('')
    setCapDiario(500); setUsarRamp(true)
    setParsed({ headers: [], rows: [] }); setTelCol(null); setNomeCol(null)
    setWeddingId(''); setGuestIds(new Set())
    setBusy(false); setCampaignId(null); setResults(null); setErro(null)
  }, [])

  const close = useCallback(() => { reset(); onClose() }, [reset, onClose])

  const handleParsed = useCallback((p: ParsedLista) => {
    setParsed(p)
    const g = guessColumns(p.headers)
    setTelCol(g.telCol)
    setNomeCol(g.nomeCol)
  }, [])

  const onFile = useCallback(async (file: File) => {
    try { handleParsed(await parseFileLista(file)) } catch { setErro('Não consegui ler o arquivo.') }
  }, [handleParsed])

  const insertVar = useCallback((v: string) => {
    const el = corpoRef.current
    const token = `{{${v}}}`
    if (!el) { setCorpo((c) => c + token); return }
    const start = el.selectionStart ?? corpo.length
    const end = el.selectionEnd ?? corpo.length
    setCorpo((c) => c.slice(0, start) + token + c.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }, [corpo])

  // Preview com a 1ª linha
  const preview = useMemo(() => {
    const firstVars: Record<string, string> = {}
    let firstNome = 'Maria'
    if (tab === 'lista' && parsed.rows.length > 0 && telCol) {
      const r = parsed.rows.find((x) => (x[telCol] ?? '').trim() !== '') ?? parsed.rows[0]
      if (nomeCol) firstNome = r[nomeCol] || firstNome
      for (const h of parsed.headers) {
        if (h === telCol || h === nomeCol) continue
        firstVars[slugifyHeader(h)] = r[h] ?? ''
      }
    } else if (tab === 'casamento') {
      const g = guests.find((x) => guestIds.has(x.id))
      if (g?.nome) firstNome = g.nome
    }
    let body = corpo.replace(/\{\{\s*nome\s*\}\}/g, firstNome)
    for (const [k, val] of Object.entries(firstVars)) {
      body = body.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), val)
    }
    return body.replace(/\{\{\s*[^}]+\s*\}\}/g, '')
  }, [corpo, tab, parsed, telCol, nomeCol, guests, guestIds])

  const canReview =
    titulo.trim() !== '' &&
    corpo.trim() !== '' &&
    phoneNumberId !== '' &&
    !linhaOficial &&
    recipientCount > 0

  // ── Ações ─────────────────────────────────────────────────────────────────
  const buildPublico = useCallback((): IngestRow[] => {
    if (tab !== 'lista' || !telCol) return []
    return parsed.rows
      .filter((r) => (r[telCol] ?? '').trim() !== '')
      .map((r) => {
        const variaveisRow: Record<string, string> = {}
        for (const h of parsed.headers) {
          if (h === telCol || h === nomeCol) continue
          variaveisRow[slugifyHeader(h)] = r[h] ?? ''
        }
        return { telefone: r[telCol], nome: nomeCol ? r[nomeCol] : undefined, variaveis: variaveisRow }
      })
  }, [tab, telCol, nomeCol, parsed])

  const handleReview = useCallback(async () => {
    if (!canReview) return
    setBusy(true); setErro(null)
    try {
      const id = await criarCampanha({
        titulo: titulo.trim(),
        corpo_mensagem: corpo,
        phone_number_id: phoneNumberId,
        cap_diario: capDiario,
        usar_ramp: usarRamp,
        variaveis_mapeadas: variaveis,
      })
      const publico = buildPublico()
      const gids = tab === 'casamento' ? Array.from(guestIds) : undefined
      const res = await ingestRecipients(id, publico, gids)
      setCampaignId(id)
      setResults(res)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao preparar o disparo.')
    } finally {
      setBusy(false)
    }
  }, [canReview, criarCampanha, titulo, corpo, phoneNumberId, capDiario, usarRamp, variaveis, buildPublico, tab, guestIds, ingestRecipients])

  const handleEditar = useCallback(async () => {
    if (campaignId) { try { await cancelar(campaignId) } catch { /* draft */ } }
    setCampaignId(null); setResults(null)
  }, [campaignId, cancelar])

  const handleDisparar = useCallback(async () => {
    if (!campaignId) return
    setBusy(true); setErro(null)
    try {
      await calcularAgenda(campaignId)
      close()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao agendar o disparo.')
    } finally {
      setBusy(false)
    }
  }, [campaignId, calcularAgenda, close])

  if (!open) return null

  const aceitos = results?.filter((r) => r.out_resultado === 'aceito') ?? []
  const novos = aceitos.filter((r) => r.out_criado_novo).length
  const rejeitados = results?.filter((r) => r.out_resultado === 'rejeitado') ?? []
  const optOuts = rejeitados.filter((r) => r.out_motivo === 'opt_out').length
  const dias = estimarDias(aceitos.length, capDiario, usarRamp)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={close}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Novo disparo</h2>
            <p className="text-xs text-slate-500 mt-0.5">Mensagem de texto livre, enviada com segurança ao longo do tempo.</p>
          </div>
          <button onClick={close} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        {erro && (
          <div className="mx-6 mt-4 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{erro}</span>
          </div>
        )}

        {/* ─── FASE REVISÃO ─────────────────────────────────────────────── */}
        {results ? (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Vão receber" value={aceitos.length} tone="indigo" icon={<Users className="w-4 h-4" />} />
              <StatCard label="Contatos novos" value={novos} tone="emerald" icon={<Plus className="w-4 h-4" />} />
              <StatCard label="Pediram pra sair" value={optOuts} tone="slate" icon={<Ban className="w-4 h-4" />} />
              <StatCard label="Termina em" value={`${dias} ${dias === 1 ? 'dia' : 'dias'}`} tone="amber" />
            </div>

            {rejeitados.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-2">{rejeitados.length} não entraram</h4>
                <div className="border border-slate-200 rounded-md max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {rejeitados.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span className="text-slate-700">{r.out_nome || r.out_telefone || '—'}</span>
                      <span className="text-xs text-amber-700">{MOTIVO_LABEL[r.out_motivo ?? ''] ?? r.out_motivo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Prévia da mensagem</div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{preview || '—'}</p>
              <div className="mt-2 text-xs text-slate-500">
                Linha: <span className="font-medium text-slate-700">{linhaSelecionada?.phone_number_label}</span> · até{' '}
                <span className="font-medium text-slate-700">{capDiario}/dia</span>{usarRamp ? ' (começa devagar)' : ''} · 08h–20h
              </div>
            </div>

            {aceitos.length === 0 && (
              <div className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                Nenhum destinatário válido. Volte e revise a lista.
              </div>
            )}
          </div>
        ) : (
          /* ─── FASE COMPOSIÇÃO ──────────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Coluna esquerda: público */}
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Nome do disparo (só pra você se organizar)"
                className="h-10 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
              />

              {/* Tabs público */}
              <div className="inline-flex bg-slate-100 rounded-md p-0.5 self-start">
                <TabBtn active={tab === 'lista'} onClick={() => setTab('lista')} icon={<ClipboardPaste className="w-3.5 h-3.5" />} label="Colar / importar lista" />
                <TabBtn active={tab === 'casamento'} onClick={() => setTab('casamento')} icon={<Heart className="w-3.5 h-3.5" />} label="De um casamento" />
              </div>

              {tab === 'lista' ? (
                <div className="flex flex-col gap-3">
                  <textarea
                    onChange={(e) => handleParsed(parsePastedLista(e.target.value))}
                    placeholder={'Cole sua planilha aqui (com cabeçalho).\nEx:\ntelefone\tnome\tdata\n11999999999\tAna\t20/12'}
                    className="h-28 px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 resize-none"
                  />
                  <label className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> ou subir arquivo (.xlsx/.csv)
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                  </label>

                  {parsed.headers.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 w-20 shrink-0">Telefone:</span>
                        <ColSelect headers={parsed.headers} value={telCol} onChange={setTelCol} />
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 w-20 shrink-0">Nome:</span>
                        <ColSelect headers={parsed.headers} value={nomeCol} onChange={setNomeCol} allowNone />
                      </div>
                      <p className="text-xs text-slate-500">
                        {recipientCount} telefone{recipientCount === 1 ? '' : 's'} · as outras colunas viram campos
                        ({variaveis.filter((v) => v !== 'nome').map((v) => `{{${v}}}`).join(' ') || 'nenhuma'})
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <select
                    value={weddingId}
                    onChange={(e) => { setWeddingId(e.target.value); setGuestIds(new Set()) }}
                    className="h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                  >
                    <option value="">Escolher casamento…</option>
                    {weddings.map((w) => <option key={w.id} value={w.id}>{w.titulo}</option>)}
                  </select>
                  {weddingId && (
                    <div className="border border-slate-200 rounded-md max-h-52 overflow-y-auto divide-y divide-slate-100">
                      <div className="px-3 py-1.5 flex items-center justify-between bg-slate-50 sticky top-0">
                        <span className="text-xs text-slate-500">{guestIds.size} de {guests.filter((g) => g.telefone).length} com telefone</span>
                        <button
                          type="button"
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                          onClick={() => setGuestIds(new Set(guests.filter((g) => g.telefone).map((g) => g.id)))}
                        >Selecionar todos</button>
                      </div>
                      {guests.filter((g) => g.telefone).map((g) => (
                        <label key={g.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={guestIds.has(g.id)}
                            onChange={(e) => setGuestIds((prev) => {
                              const n = new Set(prev)
                              if (e.target.checked) n.add(g.id); else n.delete(g.id)
                              return n
                            })}
                          />
                          <span className="text-slate-800 truncate flex-1">{g.nome}</span>
                          <span className="text-xs text-slate-400 tabular-nums">{g.telefone}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Ritmo */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 w-28 shrink-0">Máx. por dia:</span>
                  <input
                    type="number" min={1} max={5000} value={capDiario}
                    onChange={(e) => setCapDiario(Math.max(1, parseInt(e.target.value || '1', 10)))}
                    className="w-28 h-8 px-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
                {capDiario > 500 && (
                  <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Acima de 500/dia o risco de bloqueio aumenta.</p>
                )}
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={usarRamp} onChange={(e) => setUsarRamp(e.target.checked)} />
                  Começar devagar e ir aumentando (recomendado)
                </label>
              </div>
            </div>

            {/* Coluna direita: mensagem */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700">Linha de WhatsApp</label>
                <select
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                >
                  <option value="">Selecionar linha…</option>
                  {linhas.map((l) => (
                    <option key={l.phone_number_id ?? l.id} value={l.phone_number_id ?? ''}>{l.phone_number_label}</option>
                  ))}
                </select>
                {linhaOficial && (
                  <p className="mt-1 text-xs text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Essa linha é oficial da Meta — texto livre não funciona nela. Escolha uma linha não-oficial.
                  </p>
                )}
              </div>

              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-700">Mensagem</label>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {variaveis.map((v) => (
                      <button
                        key={v} type="button" onClick={() => insertVar(v)}
                        className="px-2 h-6 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100"
                      >{`{{${v}}}`}</button>
                    ))}
                  </div>
                </div>
                <textarea
                  ref={corpoRef}
                  value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  placeholder="Oi {{nome}}! Tudo bem? ..."
                  className="flex-1 min-h-[140px] px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 resize-none"
                />
              </div>

              <div className="bg-emerald-50/40 border border-emerald-200 rounded-lg p-3">
                <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Prévia</div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[40px]">{preview || 'Escreva a mensagem para ver a prévia…'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {!results
              ? <>{recipientCount} destinatário{recipientCount === 1 ? '' : 's'}</>
              : <>Confira antes de disparar — depois ele envia sozinho ao longo do tempo.</>}
          </div>
          <div className="flex items-center gap-2">
            {results ? (
              <>
                <button type="button" onClick={handleEditar} disabled={busy} className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50">Editar</button>
                <button
                  type="button" onClick={handleDisparar} disabled={busy || aceitos.length === 0}
                  className={cn('inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white rounded-md transition-colors',
                    busy || aceitos.length === 0 ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700')}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Disparar ({aceitos.length})
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={close} className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50">Cancelar</button>
                <button
                  type="button" onClick={handleReview} disabled={!canReview || busy}
                  className={cn('inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white rounded-md transition-colors',
                    !canReview || busy ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700')}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Revisar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 text-[12px] font-medium rounded transition-colors',
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
    >{icon}{label}</button>
  )
}

function ColSelect({ headers, value, onChange, allowNone }: { headers: string[]; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-md bg-white"
    >
      {allowNone && <option value="">(nenhuma)</option>}
      {!allowNone && <option value="">Escolher coluna…</option>}
      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  )
}

function StatCard({ label, value, tone, icon }: { label: string; value: number | string; tone: 'indigo' | 'emerald' | 'slate' | 'amber'; icon?: React.ReactNode }) {
  const tones: Record<string, string> = {
    indigo: 'text-indigo-600', emerald: 'text-emerald-600', slate: 'text-slate-600', amber: 'text-amber-600',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</div>
      <div className={cn('text-2xl font-bold tabular-nums mt-0.5', tones[tone])}>{value}</div>
    </div>
  )
}
