import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Send, Upload, ClipboardPaste, AlertTriangle, Loader2, Heart, Users, CheckCircle2, Plus, Ban, Download, MessageCircle } from 'lucide-react'
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
  baixarModeloPlanilha,
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

const INPUT = 'w-full h-11 px-3.5 rounded-xl border border-ww-sand bg-white text-sm text-ww-n700 placeholder:text-ww-n400 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25 transition-[border-color,box-shadow] duration-150'

/** Linha pré-selecionada ao abrir o disparo (o usuário ainda pode trocar). */
const DEFAULT_LINE_LABEL = 'Extras - Atendimento a viagem'

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
  const didDefaultLine = useRef(false)

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

  // Entrada suave do modal (rara → pode ter polish; começa em 0.97, não 0)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!open) { setShown(false); return }
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  // Pré-seleciona a linha padrão ao abrir (uma vez); usuário pode trocar depois.
  useEffect(() => {
    if (!open) { didDefaultLine.current = false; return }
    if (didDefaultLine.current || linhas.length === 0) return
    didDefaultLine.current = true
    if (!phoneNumberId) {
      const pref = linhas.find((l) => l.phone_number_label === DEFAULT_LINE_LABEL && l.phone_number_id)
        ?? linhas.find((l) => l.phone_number_id)
      if (pref?.phone_number_id) setPhoneNumberId(pref.phone_number_id)
    }
  }, [open, linhas, phoneNumberId])

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
    const token = `[${v}]`
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
    const vars: Record<string, string> = {}
    let firstNome = 'Maria'
    if (tab === 'lista' && parsed.rows.length > 0 && telCol) {
      const r = parsed.rows.find((x) => (x[telCol] ?? '').trim() !== '') ?? parsed.rows[0]
      if (nomeCol) firstNome = r[nomeCol] || firstNome
      for (const h of parsed.headers) {
        if (h === telCol || h === nomeCol) continue
        vars[slugifyHeader(h)] = r[h] ?? ''
      }
    } else if (tab === 'casamento') {
      const g = guests.find((x) => guestIds.has(x.id))
      if (g?.nome) firstNome = g.nome
    }
    vars.nome = firstNome
    vars.primeiro_nome = (firstNome || '').split(' ')[0]
    let body = corpo
    for (const [k, val] of Object.entries(vars)) {
      // aceita {{var}} E [var], qualquer caixa (ex: [Nome], {{nome}})
      body = body.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'gi'), val)
      body = body.replace(new RegExp(`\\[\\s*${k}\\s*\\]`, 'gi'), val)
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
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-ww-n700/35 backdrop-blur-sm p-4 transition-opacity duration-200 ease-ww-soft', shown ? 'opacity-100' : 'opacity-0')}
      onClick={close}
    >
      <div
        className={cn(
          'bg-ww-paper rounded-2xl border border-ww-sand shadow-ww-modal w-full max-w-5xl max-h-[92vh] flex flex-col origin-center transition-[transform,opacity] duration-200 ease-ww-soft',
          shown ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-ww-sand">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ww-gold-soft text-ww-gold">
              <Send className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-ww-serif text-2xl leading-none text-ww-n700">Novo disparo</h2>
              <p className="mt-1.5 text-sm text-ww-n500">Escreva, escolha quem recebe, e o envio acontece sozinho ao longo do tempo.</p>
            </div>
          </div>
          <button onClick={close} className="text-ww-n400 hover:text-ww-n700 rounded-lg p-1 transition-colors duration-150"><X className="w-5 h-5" /></button>
        </div>

        {erro && (
          <div className="mx-7 mt-4 flex items-start gap-2 text-sm text-ww-rosewood bg-ww-rosewood-soft border border-ww-rosewood/20 rounded-xl px-3.5 py-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{erro}</span>
          </div>
        )}

        {/* ─── FASE REVISÃO ─────────────────────────────────────────────── */}
        {results ? (
          <div className="flex-1 overflow-y-auto px-7 py-6">
            <h3 className="font-ww-serif text-lg text-ww-n700 mb-3">Confira antes de disparar</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Vão receber" value={aceitos.length} tone="gold" icon={<Users className="w-4 h-4" />} />
              <StatCard label="Contatos novos" value={novos} tone="success" icon={<Plus className="w-4 h-4" />} />
              <StatCard label="Pediram pra sair" value={optOuts} tone="olive" icon={<Ban className="w-4 h-4" />} />
              <StatCard label="Termina em" value={`${dias} ${dias === 1 ? 'dia' : 'dias'}`} tone="rosewood" />
            </div>

            {rejeitados.length > 0 && (
              <div className="mt-5">
                <FieldLabel>{rejeitados.length} não entraram</FieldLabel>
                <div className="mt-2 border border-ww-sand rounded-xl bg-white max-h-40 overflow-y-auto divide-y divide-ww-sand/60">
                  {rejeitados.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3.5 py-2 text-sm">
                      <span className="text-ww-n700">{r.out_nome || r.out_telefone || '—'}</span>
                      <span className="text-xs text-ww-olive-ink">{MOTIVO_LABEL[r.out_motivo ?? ''] ?? r.out_motivo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <FieldLabel>Prévia da mensagem</FieldLabel>
              <PreviewBubble text={preview} className="mt-2" />
              <div className="mt-3 text-xs text-ww-n500">
                Linha <span className="font-semibold text-ww-n700">{linhaSelecionada?.phone_number_label}</span> · até{' '}
                <span className="font-semibold text-ww-n700">{capDiario}/dia</span>{usarRamp ? ' (começa devagar)' : ''} · só das 08h às 20h
              </div>
            </div>

            {aceitos.length === 0 && (
              <div className="mt-5 text-sm text-ww-olive-ink bg-ww-olive-soft border border-ww-olive/20 rounded-xl px-3.5 py-2.5">
                Nenhum destinatário válido. Volte e revise a lista.
              </div>
            )}
          </div>
        ) : (
          /* ─── FASE COMPOSIÇÃO ──────────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto px-7 py-6 grid grid-cols-1 lg:grid-cols-2 gap-7">
            {/* Coluna esquerda: público */}
            <div className="flex flex-col gap-5">
              <div>
                <FieldLabel>Nome do disparo</FieldLabel>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Convite save the date"
                  className={cn(INPUT, 'mt-1.5')}
                />
                <p className="mt-1.5 text-xs text-ww-n400">Só pra você se organizar — o convidado não vê isso.</p>
              </div>

              <div>
                <FieldLabel>Para quem vai</FieldLabel>
                <div className="mt-2 inline-flex bg-ww-cream rounded-xl p-1">
                  <TabBtn active={tab === 'lista'} onClick={() => setTab('lista')} icon={<ClipboardPaste className="w-3.5 h-3.5" />} label="Colar / importar" />
                  <TabBtn active={tab === 'casamento'} onClick={() => setTab('casamento')} icon={<Heart className="w-3.5 h-3.5" />} label="De um casamento" />
                </div>

                {tab === 'lista' ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <textarea
                      onChange={(e) => handleParsed(parsePastedLista(e.target.value))}
                      placeholder={'Cole sua planilha aqui (com cabeçalho).\nEx:\ntelefone   nome   data\n11999999999   Ana   20/12'}
                      className="h-28 px-3.5 py-2.5 text-[13px] font-mono rounded-xl border border-ww-sand bg-white text-ww-n700 placeholder:text-ww-n400 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25 transition-[border-color,box-shadow] duration-150 resize-none"
                    />
                    <div className="flex items-center gap-5">
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ww-gold-ink hover:text-ww-gold cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5" /> ou subir arquivo (.xlsx/.csv)
                        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                      </label>
                      <button
                        type="button"
                        onClick={baixarModeloPlanilha}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-ww-n500 hover:text-ww-n700 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> Baixar modelo
                      </button>
                    </div>

                    {parsed.headers.length > 0 && (
                      <div className="rounded-xl border border-ww-sand bg-ww-cream/50 p-3.5 space-y-2.5">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-ww-n500 w-20 shrink-0">Telefone</span>
                          <ColSelect headers={parsed.headers} value={telCol} onChange={setTelCol} />
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-ww-n500 w-20 shrink-0">Nome</span>
                          <ColSelect headers={parsed.headers} value={nomeCol} onChange={setNomeCol} allowNone />
                        </div>
                        <p className="text-xs text-ww-n500 leading-relaxed">
                          <span className="font-semibold text-ww-n700">{recipientCount}</span> telefone{recipientCount === 1 ? '' : 's'} · as outras colunas viram campos:{' '}
                          {variaveis.filter((v) => v !== 'nome').map((v) => `[${v}]`).join(' ') || 'nenhuma'}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    <select
                      value={weddingId}
                      onChange={(e) => { setWeddingId(e.target.value); setGuestIds(new Set()) }}
                      className={INPUT}
                    >
                      <option value="">Escolher casamento…</option>
                      {weddings.map((w) => <option key={w.id} value={w.id}>{w.titulo}</option>)}
                    </select>
                    {weddingId && (
                      <div className="rounded-xl border border-ww-sand bg-white max-h-52 overflow-y-auto divide-y divide-ww-sand/60">
                        <div className="px-3.5 py-2 flex items-center justify-between bg-ww-cream/70 sticky top-0">
                          <span className="text-xs text-ww-n500">{guestIds.size} de {guests.filter((g) => g.telefone).length} com telefone</span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-ww-gold-ink hover:text-ww-gold transition-colors"
                            onClick={() => setGuestIds(new Set(guests.filter((g) => g.telefone).map((g) => g.id)))}
                          >Selecionar todos</button>
                        </div>
                        {guests.filter((g) => g.telefone).map((g) => (
                          <label key={g.id} className="flex items-center gap-2.5 px-3.5 py-2 text-sm cursor-pointer hover:bg-ww-cream/50 transition-colors">
                            <input
                              type="checkbox"
                              className="accent-ww-gold"
                              checked={guestIds.has(g.id)}
                              onChange={(e) => setGuestIds((prev) => {
                                const n = new Set(prev)
                                if (e.target.checked) n.add(g.id); else n.delete(g.id)
                                return n
                              })}
                            />
                            <span className="text-ww-n700 truncate flex-1">{g.nome}</span>
                            <span className="text-xs text-ww-n400 tabular-nums">{g.telefone}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Ritmo */}
              <div>
                <FieldLabel>Ritmo de envio</FieldLabel>
                <div className="mt-2 rounded-xl border border-ww-sand bg-ww-cream/50 p-3.5 space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-ww-n600">Máximo por dia</span>
                    <input
                      type="number" min={1} max={5000} value={capDiario}
                      onChange={(e) => setCapDiario(Math.max(1, parseInt(e.target.value || '1', 10)))}
                      className="w-24 h-9 px-3 text-sm rounded-lg border border-ww-sand bg-white text-ww-n700 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25"
                    />
                  </div>
                  {capDiario > 500 && (
                    <p className="text-xs text-ww-olive-ink flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Acima de 500/dia o risco de bloqueio aumenta.</p>
                  )}
                  <label className="flex items-center gap-2.5 text-sm text-ww-n600 cursor-pointer">
                    <input type="checkbox" className="accent-ww-gold" checked={usarRamp} onChange={(e) => setUsarRamp(e.target.checked)} />
                    Começar devagar e ir aumentando <span className="text-ww-n400">(recomendado)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Coluna direita: mensagem */}
            <div className="flex flex-col gap-5">
              <div>
                <FieldLabel>Linha de WhatsApp</FieldLabel>
                <select
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className={cn(INPUT, 'mt-1.5')}
                >
                  <option value="">Selecionar linha…</option>
                  {linhas.map((l) => (
                    <option key={l.phone_number_id ?? l.id} value={l.phone_number_id ?? ''}>{l.phone_number_label}</option>
                  ))}
                </select>
                {linhaOficial && (
                  <p className="mt-1.5 text-xs text-ww-rosewood flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Essa linha é oficial da Meta — texto livre não funciona nela. Escolha uma linha não-oficial.
                  </p>
                )}
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <FieldLabel>Mensagem</FieldLabel>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {variaveis.map((v) => (
                      <button
                        key={v} type="button" onClick={() => insertVar(v)}
                        className="px-2 h-6 rounded-full text-[11px] font-semibold bg-ww-gold-soft text-ww-gold-ink border border-ww-gold/20 hover:bg-ww-gold/15 active:scale-95 transition-[transform,background-color] duration-150"
                      >{`[${v}]`}</button>
                    ))}
                  </div>
                </div>
                <textarea
                  ref={corpoRef}
                  value={corpo}
                  onChange={(e) => setCorpo(e.target.value)}
                  placeholder="Oi [nome]! Tudo bem? ..."
                  className="mt-1.5 flex-1 min-h-[120px] px-3.5 py-3 text-sm rounded-xl border border-ww-sand bg-white text-ww-n700 placeholder:text-ww-n400 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25 transition-[border-color,box-shadow] duration-150 resize-none leading-relaxed"
                />
              </div>

              <div>
                <FieldLabel>Prévia</FieldLabel>
                <PreviewBubble text={preview} placeholder="Escreva a mensagem para ver a prévia…" className="mt-2" />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-7 py-4 border-t border-ww-sand">
          <div className="text-sm text-ww-n500">
            {!results
              ? <><span className="font-semibold text-ww-n700 tabular-nums">{recipientCount}</span> destinatário{recipientCount === 1 ? '' : 's'}</>
              : <>Depois de disparar, ele envia sozinho ao longo do tempo.</>}
          </div>
          <div className="flex items-center gap-2.5">
            {results ? (
              <>
                <button type="button" onClick={handleEditar} disabled={busy} className="h-11 px-4 text-sm font-medium text-ww-n600 bg-white border border-ww-sand rounded-xl hover:bg-ww-cream active:scale-[0.98] transition-[transform,background-color] duration-150 ease-ww-soft disabled:opacity-50">Voltar e editar</button>
                <button
                  type="button" onClick={handleDisparar} disabled={busy || aceitos.length === 0}
                  className={cn('inline-flex items-center gap-2 h-11 px-5 text-sm font-semibold text-white rounded-xl shadow-ww-lift transition-[transform,background-color] duration-150 ease-ww-soft active:scale-[0.98]',
                    busy || aceitos.length === 0 ? 'bg-ww-sand-dk cursor-not-allowed shadow-none' : 'bg-ww-gold hover:bg-ww-gold-ink')}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Disparar ({aceitos.length})
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={close} className="h-11 px-4 text-sm font-medium text-ww-n600 bg-white border border-ww-sand rounded-xl hover:bg-ww-cream active:scale-[0.98] transition-[transform,background-color] duration-150 ease-ww-soft">Cancelar</button>
                <button
                  type="button" onClick={handleReview} disabled={!canReview || busy}
                  className={cn('inline-flex items-center gap-2 h-11 px-5 text-sm font-semibold text-white rounded-xl shadow-ww-lift transition-[transform,background-color] duration-150 ease-ww-soft active:scale-[0.98]',
                    !canReview || busy ? 'bg-ww-sand-dk cursor-not-allowed shadow-none' : 'bg-ww-gold hover:bg-ww-gold-ink')}
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-bold uppercase tracking-wide text-ww-n500">{children}</span>
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold rounded-lg transition-[background-color,color,box-shadow] duration-150 ease-ww-soft',
        active ? 'bg-white text-ww-n700 shadow-sm' : 'text-ww-n500 hover:text-ww-n700')}
    >{icon}{label}</button>
  )
}

function ColSelect({ headers, value, onChange, allowNone }: { headers: string[]; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="flex-1 h-9 px-3 text-sm rounded-lg border border-ww-sand bg-white text-ww-n700 focus:outline-none focus:border-ww-gold focus-visible:ring-2 focus-visible:ring-ww-gold/25"
    >
      {allowNone && <option value="">(nenhuma)</option>}
      {!allowNone && <option value="">Escolher coluna…</option>}
      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  )
}

const STAT_TONE: Record<string, string> = {
  gold: 'text-ww-gold-ink', success: 'text-ww-success', olive: 'text-ww-olive-ink', rosewood: 'text-ww-rosewood',
}

function StatCard({ label, value, tone, icon }: { label: string; value: number | string; tone: 'gold' | 'success' | 'olive' | 'rosewood'; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ww-sand bg-white px-4 py-3 shadow-ww-lift">
      <div className="flex items-center gap-1.5 text-xs text-ww-n500">{icon}{label}</div>
      <div className={cn('font-ww-serif text-[26px] leading-tight tabular-nums mt-1', STAT_TONE[tone])}>{value}</div>
    </div>
  )
}

/** Bolha estilo WhatsApp (mensagem enviada), com fundo de conversa quente. */
function PreviewBubble({ text, placeholder, className }: { text: string; placeholder?: string; className?: string }) {
  const empty = !text
  return (
    <div className={cn('rounded-xl border border-ww-sand bg-ww-paper p-3.5', className)}>
      <div className="flex justify-end">
        <div className="relative max-w-[88%] rounded-2xl rounded-tr-sm bg-ww-cream border border-ww-sand px-3.5 py-2.5 shadow-card">
          {empty ? (
            <p className="text-sm text-ww-n400 italic flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> {placeholder ?? '—'}</p>
          ) : (
            <>
              <p className="text-sm text-ww-n700 whitespace-pre-wrap leading-relaxed">{text}</p>
              <div className="mt-1 text-[10px] text-ww-n400 text-right">agora</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
