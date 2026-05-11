import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/Badge'
import { useTurnLog, type TurnLog } from '@/hooks/v2/useTurnLog'

interface TurnExecutionDrawerProps {
  turnId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DECISION_COLOR: Record<string, string> = {
  PUBLICAR: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  REGEN: 'bg-amber-100 text-amber-700 border-amber-300',
  ESCALAR: 'bg-red-100 text-red-700 border-red-300',
}

export function TurnExecutionDrawer({ turnId, open, onOpenChange }: TurnExecutionDrawerProps) {
  const { data: logs, isLoading } = useTurnLog(turnId)
  const [activeAttempt, setActiveAttempt] = useState<number>(1)

  if (!turnId) return null

  const currentLog =
    (logs ?? []).find((l) => l.attempt_number === activeAttempt) ?? logs?.[0] ?? null
  const hasRetry = (logs ?? []).length > 1

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white">
        <SheetHeader className="border-b border-slate-200 pb-4">
          <SheetTitle className="text-slate-900">Execução do turn</SheetTitle>
          {isLoading && <div className="text-sm text-slate-500">Carregando…</div>}
          {currentLog && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="font-mono">{currentLog.model_used ?? '—'}</span>
              <span>·</span>
              <span>{currentLog.duration_ms ?? '?'}ms</span>
              <span>·</span>
              <Badge
                className={DECISION_COLOR[currentLog.validator_verdict?.decision ?? 'PUBLICAR']}
              >
                {currentLog.validator_verdict?.decision ?? '—'}
              </Badge>
              {currentLog.slot_in_focus && (
                <>
                  <span>·</span>
                  <span>
                    slot: <code className="text-xs">{currentLog.slot_in_focus}</code>
                  </span>
                </>
              )}
            </div>
          )}
        </SheetHeader>

        {hasRetry && (
          <div className="flex gap-2 py-3 border-b border-slate-200">
            {(logs ?? []).map((log) => (
              <button
                key={log.id}
                onClick={() => setActiveAttempt(log.attempt_number)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  log.attempt_number === activeAttempt
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tentativa {log.attempt_number}
              </button>
            ))}
          </div>
        )}

        {currentLog && (
          <Tabs defaultValue="prompt" className="mt-4">
            <TabsList className="grid grid-cols-4 bg-slate-100">
              <TabsTrigger value="prompt">Prompt enviado</TabsTrigger>
              <TabsTrigger value="response">Resposta crua</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="verdict">Veredito</TabsTrigger>
            </TabsList>

            <TabsContent value="prompt" className="mt-4">
              <PromptViewer label="System prompt" text={currentLog.prompt_system ?? ''} />
              <PromptViewer
                label="Última mensagem do lead"
                text={currentLog.prompt_user ?? ''}
                className="mt-4"
              />
            </TabsContent>

            <TabsContent value="response" className="mt-4">
              <h3 className="text-sm font-medium text-slate-700 mb-2">Resposta crua do LLM</h3>
              <pre className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm font-mono whitespace-pre-wrap text-slate-900">
                {currentLog.raw_response ?? '(vazio)'}
              </pre>
              {currentLog.final_messages && currentLog.final_messages.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">
                    Mensagens enviadas ao WhatsApp:
                  </h3>
                  {currentLog.final_messages.map((m, i) => (
                    <pre
                      key={i}
                      className="bg-emerald-50 border border-emerald-200 rounded-md p-3 mb-2 text-sm font-mono whitespace-pre-wrap text-slate-900"
                    >
                      {m}
                    </pre>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="tools" className="mt-4">
              <pre className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm font-mono whitespace-pre-wrap text-slate-900">
                {JSON.stringify(currentLog.tool_calls, null, 2)}
              </pre>
            </TabsContent>

            <TabsContent value="verdict" className="mt-4">
              <pre className="bg-slate-50 border border-slate-200 rounded-md p-4 text-sm font-mono whitespace-pre-wrap text-slate-900">
                {JSON.stringify(currentLog.validator_verdict, null, 2)}
              </pre>
              <div className="mt-3 text-xs text-slate-500">
                Versão do prompt builder:{' '}
                <code>{currentLog.prompt_builder_version ?? 'unknown'}</code>
                {currentLog.discovery_config_hash && (
                  <>
                    {' · '}
                    Config hash: <code>{currentLog.discovery_config_hash}</code>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

function PromptViewer({
  label,
  text,
  className = '',
}: {
  label: string
  text: string
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.length > 1500 ? text.substring(0, 1500) + '\n…' : text

  return (
    <div className={className}>
      <h3 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
        {label}
        <span className="text-xs text-slate-500">({text.length.toLocaleString()} chars)</span>
        {text.length > 1500 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-indigo-600 text-xs hover:underline"
          >
            {expanded ? 'Recolher' : 'Ver tudo'}
          </button>
        )}
      </h3>
      <pre className="bg-slate-50 border border-slate-200 rounded-md p-4 text-xs font-mono whitespace-pre-wrap text-slate-900 max-h-96 overflow-y-auto">
        {expanded ? text : preview}
      </pre>
    </div>
  )
}

// Re-export TurnLog type pra callers (botão na conversa) que querem usar
export type { TurnLog }
