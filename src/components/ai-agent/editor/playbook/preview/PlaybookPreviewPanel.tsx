import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Code, MessageSquare, Send, Loader2, RefreshCw, Eye, EyeOff, FileText, Download, Trash2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAgentPromptPreview, type PreviewPlaybookConfig } from '@/hooks/playbook/useAgentPromptPreview'
import { colorizeXml } from '@/lib/playbook/colorizeXml'
import { PromptHumanView } from './PromptHumanView'

interface ResetTestResponse {
  ok: boolean
  reason?: string
  contact_id?: string
  archived_conversations?: number
  deleted_cards?: number
  deleted_buffer?: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  meta?: { moment_key: string | null }
}

interface Props {
  agentId: string
  /**
   * Configurações do Playbook em memória (config ainda não salva no banco).
   * Quando ausente, o backend usa as configs salvas — útil pra testar a versão "real".
   */
  previewConfig?: PreviewPlaybookConfig
  /** Whitelist do agente — usado pra habilitar botão "Zerar conversa real" e saber pra qual número resetar. */
  testWhitelist?: string[] | null
}

// Persistência do estado do painel (prompt + chat de teste) no cache do React Query.
// Sem isso, sair do painel (trocar de aba do agente) zera o que o admin já carregou.
const promptCacheKey = (agentId: string) => ['playbook-preview-panel', agentId, 'prompt']
const chatCacheKey = (agentId: string) => ['playbook-preview-panel', agentId, 'chat']

export function PlaybookPreviewPanel({ agentId, previewConfig, testWhitelist }: Props) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'chat' | 'prompt'>('chat')
  const [messages, setMessagesState] = useState<ChatMessage[]>(
    () => queryClient.getQueryData<ChatMessage[]>(chatCacheKey(agentId)) ?? [],
  )
  const [input, setInput] = useState('')
  const [lastPrompt, setLastPromptState] = useState<string | null>(
    () => queryClient.getQueryData<string>(promptCacheKey(agentId)) ?? null,
  )
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const [promptViewMode, setPromptViewMode] = useState<'code' | 'human'>('human')
  const mutation = useAgentPromptPreview()

  const setMessages = (next: ChatMessage[]) => {
    setMessagesState(next)
    queryClient.setQueryData(chatCacheKey(agentId), next)
  }

  const setLastPrompt = (next: string | null) => {
    setLastPromptState(next)
    if (next === null) queryClient.removeQueries({ queryKey: promptCacheKey(agentId) })
    else queryClient.setQueryData(promptCacheKey(agentId), next)
  }

  const loadPromptOnly = async () => {
    try {
      const res = await mutation.mutateAsync({
        agent_id: agentId,
        messages: [{ role: 'user', content: 'oi' }],
        preview_playbook_config: previewConfig,
      })
      setLastPrompt(res.prompt_used)
    } catch (err) {
      console.error('[PlaybookPreviewPanel] loadPromptOnly error:', err)
      toast.error('Não consegui carregar o prompt agora. Tenta de novo.')
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text) return
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextHistory)
    setInput('')
    try {
      const res = await mutation.mutateAsync({
        agent_id: agentId,
        messages: nextHistory.map(m => ({ role: m.role, content: m.content })),
        preview_playbook_config: previewConfig,
      })
      setLastPrompt(res.prompt_used)
      setMessages([
        ...nextHistory,
        { role: 'assistant', content: res.response, meta: { moment_key: res.current_moment_key } },
      ])
    } catch (err) {
      console.error('[PlaybookPreviewPanel] send error:', err)
      toast.error('Não consegui testar agora. Tenta de novo.')
    }
  }

  const reset = () => {
    setMessages([])
    setLastPrompt(null)
  }

  const [resetting, setResetting] = useState(false)
  const [resetMenuOpen, setResetMenuOpen] = useState(false)
  const phonesToReset = testWhitelist ?? []

  // Formata telefone pra exibição amigável: 5511964293533 → +55 (11) 96429-3533
  const formatPhone = (p: string): string => {
    const d = p.replace(/\D/g, '')
    if (d.length === 13 && d.startsWith('55')) {
      return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
    }
    if (d.length === 11) {
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    }
    return d
  }

  /**
   * Zera dados de teste no banco para os números recebidos: arquiva conversas,
   * soft-delete cards, limpa buffer e dados do contato. Cada número é
   * tratado isoladamente — útil quando vários colegas estão testando ao mesmo
   * tempo e só um quer recomeçar.
   */
  const resetRealConversation = async (targetPhones: string[]) => {
    if (targetPhones.length === 0) return
    const titulo = targetPhones.length === 1
      ? `Zerar conversa real de ${formatPhone(targetPhones[0])}?`
      : `Zerar conversa real de ${targetPhones.length} números?\n\n${targetPhones.map(formatPhone).join('\n')}`
    if (!confirm(`${titulo}\n\nIsso vai arquivar a conversa, apagar o card (soft delete) e limpar mensagens pendentes. Esses números poderão começar do zero mandando nova mensagem no WhatsApp.\n\nOs OUTROS números da whitelist não são afetados.`)) return
    setResetMenuOpen(false)
    setResetting(true)
    try {
      let archived = 0
      let deletedCards = 0
      let deletedBuffer = 0
      const erros: string[] = []
      for (const phone of targetPhones) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (supabase as any).rpc('reset_agent_test_conversation', {
            p_agent_id: agentId,
            p_phone: phone,
          })
          if (error) {
            erros.push(`${phone}: ${error.message}`)
            continue
          }
          const r = data as ResetTestResponse
          archived += r.archived_conversations ?? 0
          deletedCards += r.deleted_cards ?? 0
          deletedBuffer += r.deleted_buffer ?? 0
        } catch (err) {
          erros.push(`${phone}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      const total = archived + deletedCards + deletedBuffer
      if (total === 0 && erros.length === 0) {
        toast.success('Tudo já estava limpo — nada a apagar.')
      } else if (erros.length === 0) {
        toast.success(`Zerado: ${archived} conversa(s), ${deletedCards} card(s), ${deletedBuffer} mensagem(ns) pendente(s).`)
      } else {
        toast.warning(`Parcial: ${total} item(ns) limpo(s), ${erros.length} erro(s). Veja console.`)
        console.warn('[PlaybookPreviewPanel] erros no reset:', erros)
      }
      // Limpa também o teste local
      reset()
    } catch (err) {
      console.error('[PlaybookPreviewPanel] reset real error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Não consegui zerar: ${msg}`)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="bg-slate-50 border-l border-slate-200 h-full flex flex-col">
      <header className="flex items-center gap-1 px-3 py-2 border-b border-slate-200 bg-white">
        <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={MessageSquare} label="Testar" />
        <TabButton active={tab === 'prompt'} onClick={() => setTab('prompt')} icon={Code} label="Prompt" />
        <div className="flex-1" />
        {phonesToReset.length === 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetRealConversation([phonesToReset[0]])}
            disabled={resetting}
            title={`Apaga a conversa real, o card e o buffer pendente de ${formatPhone(phonesToReset[0])}`}
            className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
          >
            {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Zerar conversa real
          </Button>
        )}
        {phonesToReset.length > 1 && (
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetMenuOpen(o => !o)}
              disabled={resetting}
              className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
              title="Escolha qual número quer zerar — não afeta os outros"
            >
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Zerar conversa real
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
            {resetMenuOpen && !resetting && (
              <>
                {/* Backdrop pra fechar ao clicar fora */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setResetMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden">
                  <div className="px-3 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
                    Zerar de qual número?
                  </div>
                  <ul className="py-1 max-h-64 overflow-y-auto">
                    {phonesToReset.map(phone => (
                      <li key={phone}>
                        <button
                          type="button"
                          onClick={() => resetRealConversation([phone])}
                          className="w-full text-left px-3 py-2 hover:bg-rose-50 text-sm flex items-center gap-2 text-slate-700 hover:text-rose-700 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{formatPhone(phone)}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{phone}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => resetRealConversation(phonesToReset)}
                      className="w-full text-left px-3 py-2 hover:bg-rose-50 text-sm flex items-center gap-2 text-rose-600 hover:text-rose-700 rounded transition-colors font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Zerar TODOS ({phonesToReset.length})
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={reset} className="gap-1.5 text-slate-500" title="Limpa só o teste local (não toca conversa real)">
          <RefreshCw className="w-3.5 h-3.5" /> Resetar teste
        </Button>
      </header>

      {tab === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-8">Digite "oi" pra começar o teste</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn('rounded-xl px-3 py-2 text-sm max-w-[85%]', m.role === 'user' ? 'ml-auto bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-900')}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === 'assistant' && m.meta?.moment_key && (
                  <div className="mt-1 text-[10px] text-slate-400">fase: {m.meta.moment_key}</div>
                )}
              </div>
            ))}
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> pensando...
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-200 bg-white flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Teste como o lead"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <Button size="sm" onClick={send} disabled={mutation.isPending || !input.trim()} className="gap-1">
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-auto p-3">
          {!lastPrompt ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-center text-xs text-slate-500 max-w-[240px]">
                Veja o que a agente "lê" antes de responder, do jeito técnico (XML) ou em linguagem humana.
              </p>
              <Button size="sm" onClick={loadPromptOnly} disabled={mutation.isPending} className="gap-1.5">
                {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Carregar prompt
              </Button>
              <p className="text-center text-[10px] text-slate-400 max-w-[240px]">
                ou envie uma mensagem em "Testar" — o prompt aparece junto com a resposta.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex bg-slate-100 rounded-md p-0.5">
                  <ViewModeButton
                    active={promptViewMode === 'human'}
                    onClick={() => setPromptViewMode('human')}
                    icon={FileText}
                    label="Legível"
                  />
                  <ViewModeButton
                    active={promptViewMode === 'code'}
                    onClick={() => setPromptViewMode('code')}
                    icon={Code}
                    label="Código"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={loadPromptOnly} disabled={mutation.isPending} className="gap-1 text-xs" title="Recarregar prompt">
                    {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </Button>
                  {promptViewMode === 'code' && (
                    <Button variant="outline" size="sm" onClick={() => setShowFullPrompt(!showFullPrompt)} className="gap-1 text-xs">
                      {showFullPrompt ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showFullPrompt ? 'resumir' : 'expandir'}
                    </Button>
                  )}
                </div>
              </div>

              {promptViewMode === 'code' ? (
                <pre className={cn('bg-slate-900 rounded-lg p-3 text-[11px] font-mono overflow-auto whitespace-pre-wrap break-words', showFullPrompt ? '' : 'max-h-[400px]')}>
                  {colorizeXml(lastPrompt)}
                </pre>
              ) : (
                <PromptHumanView prompt={lastPrompt} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof MessageSquare; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors', active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100')}
    >
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  )
}

function ViewModeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof MessageSquare; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors', active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
    >
      <Icon className="w-3 h-3" />{label}
    </button>
  )
}
