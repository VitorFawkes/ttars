import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, X, Ear } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { useAgentListening, DEFAULT_LISTENING, type ListeningConfig } from '@/hooks/playbook/useAgentListening'

interface Props {
  agentId: string
}

interface ToggleDef {
  key: keyof Pick<ListeningConfig, 'echo_social_questions' | 'acknowledge_observations' | 'handle_message_bursts' | 'never_ignore_lead'>
  title: string
  description: string
  example?: { lead: string; agent: string }
}

const TOGGLES: ToggleDef[] = [
  {
    key: 'echo_social_questions',
    title: 'Devolve gentileza social antes de continuar',
    description:
      'Quando o cliente pergunta de volta "tudo bem?", "e você?", "como vai?" — ela responde em uma frase curta e natural antes de seguir o roteiro.',
    example: {
      lead: 'Oi, tudo bem? Vim do site, queria saber sobre Destination Wedding. E você, como vai?',
      agent: 'Tudo ótimo, obrigada por perguntar! Que bom te ver por aqui. Pra começar, me conta seu nome?',
    },
  },
  {
    key: 'acknowledge_observations',
    title: 'Reconhece observações espontâneas',
    description:
      'Quando o cliente faz um comentário ("nossa, que legal!", "vi vocês no Instagram", "minha amiga casou com vocês"), ela acolhe a observação em uma frase antes de continuar.',
    example: {
      lead: 'Vi vocês no Insta, o casamento da Marina foi lindo!',
      agent: 'O da Marina foi especial mesmo. Que bom que chegou aqui dessa forma. Me conta seu nome pra gente conversar direito?',
    },
  },
  {
    key: 'handle_message_bursts',
    title: 'Trata várias mensagens seguidas como um turno só',
    description:
      'Quando o cliente manda 2 ou 3 mensagens em sequência (acontece muito no WhatsApp), ela considera tudo como um turno: responde o que precisa ser respondido E faz a próxima pergunta. Nunca ignora parte do que ele disse.',
    example: {
      lead: '"Oi"  /  "Vim do site"  /  "Me chamo Vitor e queremos casar em 2027"',
      agent: 'Oi Vitor, que ótimo te receber! 2027 é uma janela legal pra planejar com calma. Vocês já têm alguma ideia de destino ou ainda estão pensando?',
    },
  },
  {
    key: 'never_ignore_lead',
    title: 'Nunca ignora o que o cliente disse',
    description:
      'Princípio geral: conversa real é dos dois lados, não é formulário. Se o cliente trouxe algo (pergunta, dúvida, objeção, comentário), ela acolhe antes de avançar. Quando esse princípio está ativo, a IA prioriza responder o que veio do cliente sobre seguir cegamente o próximo passo do funil.',
  },
]

export function ListeningSection({ agentId }: Props) {
  const { listening, isLoading, save } = useAgentListening(agentId)
  const [config, setConfig] = useState<Required<ListeningConfig>>(DEFAULT_LISTENING)
  const [newExample, setNewExample] = useState('')
  const [dirty, setDirty] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (listening) {
      setConfig({
        echo_social_questions: listening.echo_social_questions ?? DEFAULT_LISTENING.echo_social_questions,
        acknowledge_observations: listening.acknowledge_observations ?? DEFAULT_LISTENING.acknowledge_observations,
        handle_message_bursts: listening.handle_message_bursts ?? DEFAULT_LISTENING.handle_message_bursts,
        never_ignore_lead: listening.never_ignore_lead ?? DEFAULT_LISTENING.never_ignore_lead,
        examples: listening.examples ?? DEFAULT_LISTENING.examples,
      })
      setDirty(false)
    }
  }, [listening])
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggle = (key: ToggleDef['key']) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }))
    setDirty(true)
  }

  const addExample = () => {
    const txt = newExample.trim()
    if (!txt) return
    setConfig(prev => ({ ...prev, examples: [...prev.examples, txt] }))
    setNewExample('')
    setDirty(true)
  }

  const removeExample = (idx: number) => {
    setConfig(prev => ({ ...prev, examples: prev.examples.filter((_, i) => i !== idx) }))
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      await save.mutateAsync(config)
      toast.success('Escuta salva')
      setDirty(false)
    } catch (err) {
      console.error('[ListeningSection] save error:', err)
      toast.error('Não consegui salvar.')
    }
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin inline" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 flex gap-3">
        <Ear className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-600 leading-relaxed">
          O cliente nem sempre segue o roteiro. Aqui você ensina a agente a <strong>escutar</strong>:
          se devolverem uma pergunta, fizerem um comentário, ou mandarem várias mensagens juntas, ela
          reage com naturalidade antes de continuar com a próxima pergunta do funil.
        </p>
      </div>

      <div className="space-y-3">
        {TOGGLES.map(t => (
          <div
            key={t.key}
            className={`rounded-xl border p-4 transition-colors ${
              config[t.key]
                ? 'border-indigo-200 bg-indigo-50/30'
                : 'border-slate-200 bg-white'
            }`}
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config[t.key]}
                onChange={() => toggle(t.key)}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">{t.title}</div>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">{t.description}</p>

                {t.example && (
                  <div className="mt-2.5 rounded-md border border-slate-200 bg-white p-2.5 space-y-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">
                      Exemplo
                    </div>
                    <div className="text-xs text-slate-600">
                      <span className="font-medium text-slate-500">Cliente:</span> {t.example.lead}
                    </div>
                    <div className="text-xs text-slate-700">
                      <span className="font-medium text-indigo-600">Ela responde:</span> {t.example.agent}
                    </div>
                  </div>
                )}
              </div>
            </label>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-slate-100">
        <div className="text-sm font-medium text-slate-700 mb-1">
          Exemplos personalizados de como você quer que ela responda
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Opcional. Cole exemplos de respostas naturais pra orientar a IA — ela vai usar como
          inspiração, sem copiar literalmente.
        </p>

        <ul className="space-y-2 mb-3">
          {config.examples.map((ex, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <span className="flex-1 text-sm text-slate-700 whitespace-pre-wrap">{ex}</span>
              <button
                onClick={() => removeExample(idx)}
                className="text-slate-400 hover:text-rose-500 mt-0.5"
                title="Remover"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <textarea
            value={newExample}
            onChange={e => setNewExample(e.target.value)}
            placeholder='Ex: Quando o cliente diz "que legal!", ela responde "Que bom que curtiu! ..."'
            rows={2}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none"
          />
          <Button
            onClick={addExample}
            disabled={!newExample.trim()}
            variant="secondary"
            className="self-stretch"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={!dirty || save.isPending} className="gap-2">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {save.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
