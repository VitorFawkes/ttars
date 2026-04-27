import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Code, MessageSquare, Send, Loader2, RefreshCw, Eye, EyeOff, FileText, Download, Trash2 } from 'lucide-react'
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
  previewConfig: PreviewPlaybookConfig
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
  const phoneToReset = testWhitelist?.[0] ?? null

  /**
   * Zera tudo do número de teste no banco: arquiva conversa real, soft-delete
   * card, limpa buffer. Restrito ao número da whitelist do agente.
   * Chama RPC reset_agent_test_conversation que valida whitelist no backend.
   */
  const resetRealConversation = async () => {
    if (!phoneToReset) return
    if (!confirm(`Zerar conversa real do número ${phoneToReset}?\n\nIsso vai arquivar a conversa, apagar o card (soft delete) e limpar mensagens pendentes. Você poderá começar do zero mandando uma nova mensagem no WhatsApp.`)) return
    setResetting(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('reset_agent_test_conversation', {
        p_agent_id: agentId,
        p_phone: phoneToReset,
      })
      if (error) throw error
      const r = data as ResetTestResponse
      if (r.reason === 'no_contact_found') {
        toast.success('Já estava limpo — nenhuma conversa pra zerar.')
      } else {
        toast.success(`Zerado: ${r.archived_conversations} conversa(s), ${r.deleted_cards} card(s), ${r.deleted_buffer} mensagem(ns) pendente(s).`)
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
        {phoneToReset && (
          <Button
            variant="outline"
            size="sm"
            onClick={resetRealConversation}
            disabled={resetting}
            title={`Apaga a conversa real, o card e o buffer pendente do número ${phoneToReset}`}
            className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
          >
            {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Zerar conversa real
          </Button>
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
