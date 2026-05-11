import { useState } from 'react'
import { UserCircle, Send, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useParticipant, type Participant } from '@/hooks/viagem/useParticipant'

const RELACAO_OPTIONS = [
  { value: '', label: 'Prefiro não dizer' },
  { value: 'marido', label: 'Marido' },
  { value: 'esposa', label: 'Esposa' },
  { value: 'companheiro', label: 'Companheiro(a)' },
  { value: 'filho', label: 'Filho' },
  { value: 'filha', label: 'Filha' },
  { value: 'pai', label: 'Pai' },
  { value: 'mae', label: 'Mãe' },
  { value: 'amigo', label: 'Amigo(a)' },
  { value: 'outro', label: 'Outro' },
]

interface Props {
  viagemId: string
  token: string
  tpNome: string | null
  onIdentified: (p: Participant) => void
}

/**
 * Modal/tela de identificação que aparece quando o passageiro abre o portal
 * pela primeira vez (sem cookie). É bloqueante — fica na frente do conteúdo
 * até identificar.
 */
export function ParticipantGate({ viagemId, token, tpNome, onIdentified }: Props) {
  const { identify } = useParticipant(viagemId)

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [relacao, setRelacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = nome.trim().length > 1 && (email.trim() || telefone.trim())

  const handleSubmit = async () => {
    setError(null)
    if (!valid) {
      setError('Preenche nome e pelo menos um contato (email ou celular).')
      return
    }
    setSaving(true)
    try {
      const p = await identify({
        token,
        nome: nome.trim(),
        email: email.trim() || null,
        telefone: telefone.trim() || null,
        relacao: relacao || null,
      })
      if (p) {
        toast.success(`Bem-vindo(a), ${p.nome.split(' ')[0]}!`)
        onIdentified(p)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não consegui te identificar'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-indigo-50 via-white to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-2xl p-6 space-y-5">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="h-14 w-14 rounded-full bg-indigo-100 flex items-center justify-center">
            <UserCircle className="h-7 w-7 text-indigo-600" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
            Antes de começar, quem é você?
          </h1>
          <p className="text-sm text-slate-500">
            {tpNome
              ? `${tpNome} preparou esta viagem. Pode conversar e aprovar itens por aqui.`
              : 'Essa é sua página da viagem. Pode conversar e aprovar itens por aqui.'}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Seu nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome e sobrenome"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Celular</label>
            <input
              type="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
            />
            <p className="text-[11px] text-slate-400 mt-1">E-mail ou celular — basta um</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Quem você é na viagem?
            </label>
            <select
              value={relacao}
              onChange={(e) => setRelacao(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
            >
              {RELACAO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <button
            type="button"
            disabled={!valid || saving}
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {saving ? 'Entrando...' : 'Entrar na viagem'}
          </button>
        </div>

        <p className="text-[11px] text-center text-slate-400">
          Esta identificação serve só pra personalizar suas mensagens. Você pode limpar e entrar de novo a qualquer momento.
        </p>
      </div>
    </div>
  )
}
