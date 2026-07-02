import { useRef, useState } from 'react'
import { Sparkles, Send, Loader2, Wand2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { usePlanejamentoCampos } from '../../hooks/planejamento/usePlanejamentoCampos'

// Assistente IA do casamento — agente PRÓPRIO do Weddings (edge ww-assistente),
// na mesma arquitetura do Trips mas separado:
//  • Chat: pergunte qualquer coisa sobre o que foi trocado (WhatsApp, e-mail,
//    reuniões) — a IA responde citando quando/onde apareceu.
//  • Atualizar campos: a IA LÊ tudo e SUGERE valores; a pessoa revisa item a
//    item e confirma — nada é aplicado sozinho (sugere → pessoa confirma).

interface ChatMsg { role: 'user' | 'assistant'; content: string }

interface Sugestao {
  key: string
  label: string
  type: string
  novo: unknown
  atual: unknown
  justificativa: string | null
}

function fmtValor(v: unknown): string {
  if (v == null || v === '') return '—'
  if (v === true || v === 'true') return 'sim'
  if (v === false || v === 'false') return 'não'
  return String(v)
}

export function AssistenteCasamentoSection({ cardId }: { cardId: string }) {
  const campos = usePlanejamentoCampos()

  // ── chat ──
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [pergunta, setPergunta] = useState('')
  const [pensando, setPensando] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  // ── extração ──
  const [extraindo, setExtraindo] = useState(false)
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null)
  const [aceitas, setAceitas] = useState<Set<string>>(new Set())

  const scrollChat = () => {
    window.setTimeout(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    }, 50)
  }

  const perguntar = async () => {
    const q = pergunta.trim()
    if (!q || pensando) return
    setPergunta('')
    setMsgs((prev) => [...prev, { role: 'user', content: q }])
    setPensando(true)
    scrollChat()
    try {
      const { data, error } = await supabase.functions.invoke('ww-assistente', {
        body: { action: 'chat', card_id: cardId, question: q, chat_history: msgs.slice(-10) },
      })
      if (error) throw error
      const answer = (data as { answer?: string; error?: string })?.answer
      if (!answer) throw new Error((data as { error?: string })?.error || 'sem resposta')
      setMsgs((prev) => [...prev, { role: 'assistant', content: answer }])
    } catch (e) {
      toast.error(`O assistente não respondeu: ${e instanceof Error ? e.message : String(e)}`)
      setMsgs((prev) => prev.slice(0, -1))
      setPergunta(q)
    } finally {
      setPensando(false)
      scrollChat()
    }
  }

  const extrair = async () => {
    setExtraindo(true)
    setSugestoes(null)
    try {
      const { data, error } = await supabase.functions.invoke('ww-assistente', {
        body: { action: 'extract', card_id: cardId },
      })
      if (error) throw error
      const resp = data as { sugestoes?: Sugestao[]; error?: string }
      if (resp.error) throw new Error(resp.error)
      const list = resp.sugestoes ?? []
      setSugestoes(list)
      setAceitas(new Set(list.map((s) => s.key)))
      if (list.length === 0) toast.message('Nada novo pra atualizar', { description: 'A IA não achou informação confirmada que ainda não esteja no card.' })
    } catch (e) {
      toast.error(`Não consegui ler as conversas: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExtraindo(false)
    }
  }

  const aplicar = () => {
    if (!sugestoes) return
    const values: Record<string, unknown> = {}
    for (const s of sugestoes) {
      if (aceitas.has(s.key)) values[s.key] = s.novo
    }
    if (Object.keys(values).length === 0) return
    campos.save.mutate(
      { cardId, values },
      {
        onSuccess: () => {
          toast.success(`${Object.keys(values).length} campo(s) atualizados.`)
          setSugestoes(null)
        },
      },
    )
  }

  const toggleAceita = (key: string) =>
    setAceitas((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  return (
    <div className="pt-3 flex flex-col gap-4">
      <p className="text-[12px] text-[#9A9082] [font-family:'Roboto',sans-serif]">
        A IA conhece <b>tudo deste casamento</b>: WhatsApp, e-mails, reuniões (com transcrição) e os dados do card.
        Pergunte qualquer coisa — ou peça pra ela sugerir a atualização dos campos. <b>Nada é alterado sem a sua confirmação.</b>
      </p>

      {/* ── Atualização de campos (sugere → pessoa confirma) ── */}
      <div className="rounded-xl border border-[#EEE7DA] bg-[#FBF9F5] p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Wand2 className="w-4 h-4 text-[#BD965C]" />
          <span className="text-[13px] font-semibold text-[#3A3633]">Atualizar campos pelas conversas</span>
          <button
            type="button"
            onClick={extrair}
            disabled={extraindo}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#BD965C] text-white text-[12.5px] font-semibold hover:bg-[#a37f47] disabled:opacity-50"
          >
            {extraindo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {extraindo ? 'Lendo as conversas…' : 'Ler conversas e sugerir'}
          </button>
        </div>

        {sugestoes && sugestoes.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {sugestoes.map((s) => (
              <label
                key={s.key}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border bg-white px-3 py-2 cursor-pointer select-none',
                  aceitas.has(s.key) ? 'border-[#E6D3B3]' : 'border-slate-100 opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  checked={aceitas.has(s.key)}
                  onChange={() => toggleAceita(s.key)}
                  className="mt-0.5 rounded border-slate-300 text-[#BD965C] focus:ring-[#BD965C]/30"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-[#3A3633]">{s.label}</span>
                  <span className="block text-[12px] text-[#5C5751]">
                    <span className="text-[#B5ABA0]">{fmtValor(s.atual)}</span>
                    <span className="mx-1.5 text-[#D9CFC2]">virou</span>
                    <b className="text-emerald-700">{fmtValor(s.novo)}</b>
                  </span>
                  {s.justificativa && <span className="block text-[11px] text-[#B5ABA0] mt-0.5">“{s.justificativa}”</span>}
                </span>
              </label>
            ))}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setSugestoes(null)} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-600 hover:bg-slate-50">
                <X className="w-3.5 h-3.5" /> Descartar
              </button>
              <button
                type="button"
                onClick={aplicar}
                disabled={aceitas.size === 0 || campos.save.isPending}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-emerald-600 text-white text-[12.5px] font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> {campos.save.isPending ? 'Aplicando…' : `Aplicar ${aceitas.size} campo(s)`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Chat ── */}
      <div className="rounded-xl border border-[#EEE7DA] bg-white overflow-hidden flex flex-col">
        <div ref={chatRef} className="max-h-[360px] min-h-[120px] overflow-y-auto p-3 flex flex-col gap-2">
          {msgs.length === 0 && (
            <div className="text-[12px] text-[#B5ABA0] italic px-1 py-3">
              Exemplos: “qual foi o último e-mail do casal?” · “o que ficou decidido sobre o bloqueio de quartos?” ·
              “quando eles pediram pra trocar a data?”
            </div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={cn(
                'rounded-xl px-3.5 py-2.5 text-[13px] whitespace-pre-wrap break-words max-w-[92%]',
                m.role === 'user'
                  ? 'self-end bg-[#FBF6E8] border border-[#E6D3B3] text-[#5C4A2A]'
                  : 'self-start bg-slate-50 border border-slate-200 text-[#3A3633]',
              )}
            >
              {m.content}
            </div>
          ))}
          {pensando && (
            <div className="self-start inline-flex items-center gap-2 text-[12px] text-[#A88C57] px-2 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> lendo o histórico…
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-[#F0E9DD] bg-[#FBF9F5] p-2.5">
          <textarea
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar() }
            }}
            rows={1}
            placeholder="Pergunte sobre este casamento…"
            className="flex-1 px-3 py-2 border border-[#E0D6C8] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BD965C]/30 focus:border-[#BD965C] resize-none"
          />
          <button
            type="button"
            onClick={perguntar}
            disabled={!pergunta.trim() || pensando}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[10px] text-[13px] font-semibold bg-[#BD965C] text-white hover:bg-[#a37f47] disabled:opacity-50 shrink-0"
          >
            <Send className="w-[14px] h-[14px]" />
          </button>
        </div>
      </div>
    </div>
  )
}
