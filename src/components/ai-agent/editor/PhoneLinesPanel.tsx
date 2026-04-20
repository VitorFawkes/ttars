import { useState } from 'react'
import { Phone, PowerOff, AlertTriangle, Filter, Send, ChevronDown, ChevronUp, X, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useTogglePhoneLineConfig,
  useUpdatePhoneLineRoutingFilter,
  useEnqueueTestOutbound,
  type AiAgent,
} from '@/hooks/useAiAgents'

interface Props {
  agent: AiAgent
}

export function PhoneLinesPanel({ agent }: Props) {
  const lines = agent.ai_agent_phone_line_config ?? []
  if (lines.length === 0) return null

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-3">
        <header className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-teal-500" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Linhas WhatsApp que este agente atende</h3>
            <p className="text-xs text-slate-500">Ative cada linha separadamente. Use o filtro de telefones para testes isolados.</p>
          </div>
        </header>

        {!agent.ativa && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <PowerOff className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">Agente desligado — nenhuma mensagem é respondida mesmo com linhas ativas.</p>
          </div>
        )}
        {agent.ativa && lines.every(l => !l.ativa) && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Agente ligado, mas nenhuma linha está ativa.</p>
          </div>
        )}

        <div className="space-y-2">
          {lines.map((line) => (
            <PhoneLineRow key={line.id} agentId={agent.id} agentAtiva={agent.ativa} line={line} />
          ))}
        </div>
      </section>

      <TestOutboundPanel agent={agent} />
    </div>
  )
}

function PhoneLineRow({
  agentId, agentAtiva, line,
}: {
  agentId: string
  agentAtiva: boolean
  line: NonNullable<AiAgent['ai_agent_phone_line_config']>[number]
}) {
  const toggle = useTogglePhoneLineConfig(agentId)
  const updateFilter = useUpdatePhoneLineRoutingFilter(agentId)
  const [expanded, setExpanded] = useState(false)

  const allowedPhones = line.routing_filter?.allowed_phones ?? []
  const hasFilter = allowedPhones.length > 0

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn('w-2 h-2 rounded-full flex-shrink-0', line.ativa && agentAtiva ? 'bg-green-500' : 'bg-slate-300')} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">
              {line.whatsapp_linha_config?.phone_number_label || 'Linha sem nome'}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {line.whatsapp_linha_config?.phone_number_id && (
                <span className="truncate">ID: {line.whatsapp_linha_config.phone_number_id}</span>
              )}
              {hasFilter && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-medium">
                  <Filter className="w-3 h-3" /> filtro ativo ({allowedPhones.length})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setExpanded(e => !e)} className="h-8 w-8 p-0" title="Editar filtro">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Switch
            checked={line.ativa}
            disabled={toggle.isPending}
            onCheckedChange={(v) => {
              toggle.mutate(
                { configId: line.id, ativa: v },
                {
                  onSuccess: () => toast.success(v ? 'Linha ativada' : 'Linha desativada'),
                  onError: () => toast.error('Erro ao atualizar linha'),
                },
              )
            }}
          />
        </div>
      </div>

      {expanded && (
        <RoutingFilterEditor
          allowedPhones={allowedPhones}
          saving={updateFilter.isPending}
          onSave={(phones) => {
            const next = phones.length > 0 ? { allowed_phones: phones } : null
            updateFilter.mutate(
              { configId: line.id, routingFilter: next },
              {
                onSuccess: () => toast.success(next ? 'Filtro salvo' : 'Filtro removido'),
                onError: () => toast.error('Erro ao salvar filtro'),
              },
            )
          }}
        />
      )}
    </div>
  )
}

function RoutingFilterEditor({
  allowedPhones, saving, onSave,
}: {
  allowedPhones: string[]
  saving: boolean
  onSave: (phones: string[]) => void
}) {
  const [phones, setPhones] = useState<string[]>(allowedPhones)
  const [input, setInput] = useState('')

  const addPhone = () => {
    const cleaned = input.replace(/\D/g, '')
    if (cleaned.length < 10) {
      toast.error('Telefone inválido — use DDD + número')
      return
    }
    if (phones.includes(cleaned)) {
      toast.error('Telefone já está na lista')
      return
    }
    setPhones([...phones, cleaned])
    setInput('')
  }

  const removePhone = (p: string) => {
    setPhones(phones.filter(x => x !== p))
  }

  const dirty = JSON.stringify(phones.sort()) !== JSON.stringify([...allowedPhones].sort())

  return (
    <div className="border-t border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Filter className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">Restringir a telefones específicos</p>
          <p className="text-xs text-slate-500">Quando preenchido, o agente só responde às mensagens vindas destes números. Útil para testes isolados. Deixe vazio para atender qualquer telefone.</p>
        </div>
      </div>

      <div className="space-y-2">
        {phones.length === 0 && (
          <p className="text-xs text-slate-400 italic">Nenhum telefone — o agente atende qualquer número.</p>
        )}
        {phones.map((p) => (
          <div key={p} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded border border-slate-200">
            <span className="text-sm text-slate-900 font-mono">{formatPhone(p)}</span>
            <Button variant="ghost" size="sm" onClick={() => removePhone(p)} className="h-7 w-7 p-0 text-red-500 hover:bg-red-50">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex: 5511964293533 ou (11) 96429-3533"
          className="flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addPhone()
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={addPhone} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </Button>
      </div>

      {dirty && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setPhones(allowedPhones)} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={() => onSave(phones)} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar filtro'}
          </Button>
        </div>
      )}
    </div>
  )
}

function TestOutboundPanel({ agent }: { agent: AiAgent }) {
  const [phone, setPhone] = useState('11964293533')
  const enqueue = useEnqueueTestOutbound()

  const mode = (agent as unknown as { interaction_mode?: string }).interaction_mode ?? 'inbound'
  const firstMsg = (agent as unknown as { first_message_config?: unknown }).first_message_config
  const canTest = mode !== 'inbound' && firstMsg != null

  const handleFire = () => {
    enqueue.mutate(
      { agentId: agent.id, phone },
      {
        onSuccess: (res) => {
          if (res.ok) {
            toast.success(res.note || 'Teste enfileirado')
          } else {
            toast.error(res.hint || res.error || 'Erro ao disparar teste')
          }
        },
        onError: (e: unknown) => {
          const msg = (e as { message?: string })?.message ?? 'Erro desconhecido'
          toast.error(`Erro: ${msg}`)
        },
      },
    )
  }

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-3">
      <header className="flex items-center gap-2">
        <Send className="w-4 h-4 text-indigo-500" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Disparar teste de mensagem inicial</h3>
          <p className="text-xs text-slate-500">Enfileira uma primeira mensagem outbound para um número específico. O agente precisa ter modo híbrido ou outbound e primeira mensagem configurada.</p>
        </div>
      </header>

      {!canTest && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            {mode === 'inbound'
              ? 'Agente está em modo "só responde". Troque para híbrido ou outbound na aba Modo de interação.'
              : 'Falta configurar a primeira mensagem na aba Modo de interação.'}
          </p>
        </div>
      )}

      {!agent.ativa && canTest && (
        <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <PowerOff className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600">Agente está desligado. O job fica na fila, mas só é enviado quando você ligar.</p>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-slate-600">Telefone destino</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="11964293533"
            className="font-mono"
            disabled={!canTest}
          />
        </div>
        <Button onClick={handleFire} disabled={!canTest || enqueue.isPending} className="gap-2">
          {enqueue.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Disparar agora
        </Button>
      </div>

      <p className="text-[11px] text-slate-400">
        Requer contato + card com esse telefone já existentes na org do agente. Se não existirem, o sistema avisa.
      </p>
    </section>
  )
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }
  return phone
}
