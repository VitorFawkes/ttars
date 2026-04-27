import { useState, type KeyboardEvent } from 'react'
import { PlayCircle, Send, Loader2, Eye, EyeOff, RotateCcw, Phone, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAgentTestWhitelist } from '@/hooks/playbook/useAgentTestWhitelist'
import { PlaybookPreviewPanel } from './playbook/preview/PlaybookPreviewPanel'

interface Props {
  agentId?: string
  agentName: string
  playbookEnabled: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: { elapsed_ms: number; tokens: { input: number; output: number } }
}

interface SimulateResponse {
  success: boolean
  response?: string
  elapsed_ms?: number
  tokens?: { input: number; output: number }
  prompt_used?: string
  modelo?: string
  error?: string
  details?: string
}

function formatPhone(p: string): string {
  // Mostra como +55 (11) 96429-3533 — só visual.
  const d = p.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }
  return d
}

function WhitelistEditor({ agentId }: { agentId: string }) {
  const { whitelist, isLoading, save, isSaving } = useAgentTestWhitelist(agentId)
  const [novo, setNovo] = useState('')

  const adicionar = async () => {
    const limpo = novo.replace(/\D/g, '')
    if (limpo.length < 10) {
      toast.error('Telefone muito curto. Inclua DDD (e o 55 do Brasil se aplicável).')
      return
    }
    if (whitelist.includes(limpo)) {
      toast.info('Esse número já está na lista.')
      setNovo('')
      return
    }
    try {
      await save([...whitelist, limpo])
      setNovo('')
      toast.success(`${formatPhone(limpo)} adicionado.`)
    } catch (err) {
      toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const remover = async (phone: string) => {
    if (!confirm(`Remover ${formatPhone(phone)} da lista?`)) return
    try {
      await save(whitelist.filter(p => p !== phone))
      toast.success('Removido.')
    } catch (err) {
      toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      adicionar()
    }
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
      <header className="flex items-center gap-2">
        <Phone className="w-5 h-5 text-indigo-500" />
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">Quem pode falar com a agente</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            A agente só responde mensagens dos números abaixo. Tudo que vier de outro número é ignorado, sem erro nem aviso. Use isso pra testar com você + colegas antes de soltar pra clientes.
          </p>
        </div>
      </header>

      <div className="flex gap-2">
        <Input
          value={novo}
          onChange={e => setNovo(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ex: (11) 96429-3533 ou 5511964293533"
          disabled={isSaving}
          className="flex-1"
        />
        <Button onClick={adicionar} disabled={isSaving || !novo.trim()} className="gap-1.5">
          <Plus className="w-4 h-4" /> Adicionar
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando lista…</p>
      ) : whitelist.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm text-slate-500">
            Nenhum número autorizado. Enquanto a lista estiver vazia, a agente não responde ninguém.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
          {whitelist.map(p => (
            <li key={p} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-900">{formatPhone(p)}</p>
                <p className="text-[11px] text-slate-400 font-mono">{p}</p>
              </div>
              <button
                onClick={() => remover(p)}
                disabled={isSaving}
                className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition-colors"
                title="Remover número"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ClassicSimulator({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [lastPrompt, setLastPrompt] = useState<string | null>(null)
  const [lastModel, setLastModel] = useState<string | null>(null)

  const send = async () => {
    if (!input.trim() || loading) return
    const userMessage: Message = { role: 'user', content: input.trim() }
    const newHistory = [...messages, userMessage]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent-simulate`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json() as SimulateResponse

      if (!data.success || !data.response) {
        toast.error(data.error || 'Erro na simulação')
        if (data.details) console.error(data.details)
        setLoading(false)
        return
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response!,
        meta: { elapsed_ms: data.elapsed_ms || 0, tokens: data.tokens || { input: 0, output: 0 } },
      }])
      setLastPrompt(data.prompt_used || null)
      setLastModel(data.modelo || null)
    } catch (err) {
      toast.error('Erro ao chamar simulador')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setMessages([])
    setInput('')
    setLastPrompt(null)
  }

  return (
    <>
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Teste ao vivo</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPrompt(v => !v)} className="gap-1.5">
              {showPrompt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPrompt ? 'Ocultar prompt' : 'Ver prompt'}
            </Button>
            <Button variant="outline" size="sm" onClick={reset} disabled={messages.length === 0} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Resetar
            </Button>
          </div>
        </header>
        <p className="text-sm text-slate-500 -mt-2">
          Simulação contra a configuração atual deste agente. Nada é gravado nem enviado ao cliente. Use para iterar prompts antes de ativar.
        </p>

        <div className="border border-slate-200 rounded-lg bg-slate-50 p-4 min-h-[300px] max-h-[500px] overflow-auto space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">
              Mande uma mensagem como se você fosse o cliente.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-900'
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.meta && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      {m.meta.elapsed_ms}ms · {m.meta.tokens.input}+{m.meta.tokens.output} tok
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> pensando…
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Mensagem como cliente…"
            disabled={loading}
          />
          <Button onClick={send} disabled={loading || !input.trim()} className="gap-1">
            <Send className="w-3.5 h-3.5" /> Enviar
          </Button>
        </div>
      </section>

      {showPrompt && lastPrompt && (
        <section className="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Prompt enviado</p>
            <p className="text-xs text-slate-400">modelo: {lastModel}</p>
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono max-h-72 overflow-auto">
            {lastPrompt}
          </pre>
        </section>
      )}
    </>
  )
}

export function TabTeste({ agentId, playbookEnabled }: Props) {
  const { whitelist } = useAgentTestWhitelist(agentId)

  if (!agentId) {
    return (
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
        <p className="text-sm text-slate-500">Salve o agente antes de testar.</p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      <WhitelistEditor agentId={agentId} />

      {playbookEnabled ? (
        <section className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <header className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <PlayCircle className="w-5 h-5 text-emerald-500" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Teste ao vivo</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulação contra a versão salva do Playbook. Use o botão "Zerar conversa real" pra limpar dados de teste antes de começar do zero.
              </p>
            </div>
          </header>
          <div className="h-[600px]">
            <PlaybookPreviewPanel agentId={agentId} testWhitelist={whitelist} />
          </div>
        </section>
      ) : (
        <ClassicSimulator agentId={agentId} />
      )}
    </div>
  )
}
