import { useEffect, useState } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useAiAgentPresentations,
  type AiAgentPresentation,
  type PresentationMode,
  type PresentationScenario,
} from '@/hooks/useAiAgentPresentations'

interface Props {
  agentId: string
  scenarioKey: PresentationScenario
  scenarioLabel: string
  scenarioDescription: string
  current: AiAgentPresentation | undefined
}

const VARIABLE_HINTS = [
  { token: '{{contact_name}}', help: 'Nome do lead (ex: "João")' },
  { token: '{{agent_name}}', help: 'Nome do agente (ex: "Luna")' },
  { token: '{{company_name}}', help: 'Nome da empresa (ex: "Welcome Trips")' },
  { token: '{{form_field:destino}}', help: 'Qualquer campo do formulário (troque "destino")' },
]

export function PresentationScenarioCard({
  agentId,
  scenarioKey,
  scenarioLabel,
  scenarioDescription,
  current,
}: Props) {
  const { upsert, remove } = useAiAgentPresentations(agentId)

  const [mode, setMode] = useState<PresentationMode>(current?.mode ?? 'faithful')
  const [fixedTemplate, setFixedTemplate] = useState<string>(current?.fixed_template ?? '')
  const [conceptText, setConceptText] = useState<string>(current?.concept_text ?? '')
  const [enabled, setEnabled] = useState<boolean>(current?.enabled ?? true)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(current?.mode ?? 'faithful')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFixedTemplate(current?.fixed_template ?? '')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConceptText(current?.concept_text ?? '')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(current?.enabled ?? true)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDirty(false)
  }, [current?.id, current?.mode, current?.fixed_template, current?.concept_text, current?.enabled])

  const markDirty = () => setDirty(true)

  const handleSave = async () => {
    const content = mode === 'fixed' ? fixedTemplate.trim() : conceptText.trim()
    if (!content) {
      toast.error(mode === 'fixed' ? 'Escreva o texto da mensagem' : 'Escreva a diretriz')
      return
    }
    try {
      await upsert.mutateAsync({
        scenario: scenarioKey,
        mode,
        fixed_template: mode === 'fixed' ? fixedTemplate.trim() : null,
        concept_text: mode === 'fixed' ? null : conceptText.trim(),
        enabled,
      })
      toast.success('Apresentação salva')
      setDirty(false)
    } catch (err) {
      console.error('[PresentationScenarioCard] save error', err)
      toast.error('Não consegui salvar. Tenta de novo.')
    }
  }

  const handleRemove = async () => {
    if (!current) return
    try {
      await remove.mutateAsync(scenarioKey)
      toast.success('Apresentação removida')
    } catch (err) {
      console.error('[PresentationScenarioCard] remove error', err)
      toast.error('Não consegui remover. Tenta de novo.')
    }
  }

  const hasSaved = !!current

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900 tracking-tight">{scenarioLabel}</h3>
            {hasSaved ? (
              enabled ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  Ativo
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200">
                  Desligado
                </span>
              )
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                Não configurado
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">{scenarioDescription}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => { setEnabled(e.target.checked); markDirty() }}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>Usar este cenário</span>
        </label>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <ModeToggleButton
          active={mode === 'fixed'}
          onClick={() => { setMode('fixed'); markDirty() }}
          title="Texto literal"
          subtitle="Envia exatamente esse texto. Só troca as variáveis. Zero improvisação."
        />
        <ModeToggleButton
          active={mode === 'faithful'}
          onClick={() => { setMode('faithful'); markDirty() }}
          title="Diretriz fiel"
          subtitle="Segue a estrutura e o conteúdo, só adapta o nome. Recomendado."
          recommended
        />
        <ModeToggleButton
          active={mode === 'concept'}
          onClick={() => { setMode('concept'); markDirty() }}
          title="Diretriz livre"
          subtitle="A IA parafrasea com liberdade. Mais criativo, menos previsível."
        />
      </div>

      {mode === 'fixed' ? (
        <div className="space-y-2">
          <textarea
            className="w-full min-h-[110px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Oi {{contact_name}}, aqui é a {{agent_name}} da {{company_name}}. Como posso ajudar?"
            value={fixedTemplate}
            onChange={(e) => { setFixedTemplate(e.target.value); markDirty() }}
          />
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer hover:text-slate-700">Variáveis disponíveis</summary>
            <ul className="mt-2 space-y-1 pl-4">
              {VARIABLE_HINTS.map((v) => (
                <li key={v.token}>
                  <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{v.token}</code>
                  <span className="ml-2">— {v.help}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : mode === 'faithful' ? (
        <div className="space-y-2">
          <textarea
            className="w-full min-h-[110px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Ex: Fico feliz que {{contact_name}} me chamou. Estou aqui pra entender o que você busca e, se fizer sentido, marcar uma conversa com nossa especialista."
            value={conceptText}
            onChange={(e) => { setConceptText(e.target.value); markDirty() }}
          />
          <p className="text-xs text-slate-500">
            Escreva a mensagem do jeito que quer que saia. A IA vai seguir a estrutura e o conteúdo
            fielmente, só adaptando o nome do lead e pequenas palavras pra soar natural. Ela
            <strong className="font-semibold text-slate-700"> não vai inventar etapas</strong> nem
            mencionar coisas que não estão no texto.
          </p>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer hover:text-slate-700">Variáveis disponíveis</summary>
            <ul className="mt-2 space-y-1 pl-4">
              {VARIABLE_HINTS.map((v) => (
                <li key={v.token}>
                  <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{v.token}</code>
                  <span className="ml-2">— {v.help}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            className="w-full min-h-[110px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Ex: Me apresento de forma breve e acolhedora, menciono que sou da Welcome Trips e pergunto como posso ajudar. Evito parecer robótica."
            value={conceptText}
            onChange={(e) => { setConceptText(e.target.value); markDirty() }}
          />
          <p className="text-xs text-slate-500">
            Descreva o conceito da abertura. A IA tem liberdade pra escrever do zero seguindo essa ideia
            e o tom da persona. Use quando quer variedade entre conversas, sabendo que o texto pode
            variar bastante.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {hasSaved && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={remove.isPending}
              className="gap-1.5 text-slate-500 hover:text-red-600"
            >
              {remove.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Remover
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-600">• alterações não salvas</span>}
          <Button
            onClick={handleSave}
            disabled={!dirty || upsert.isPending}
            size="sm"
            className="gap-1.5"
          >
            {upsert.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {upsert.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </section>
  )
}

function ModeToggleButton({
  active, onClick, title, subtitle, recommended,
}: { active: boolean; onClick: () => void; title: string; subtitle: string; recommended?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 text-left rounded-lg border px-3 py-2.5 transition-colors',
        active
          ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <div className={cn('text-sm font-medium flex items-center gap-1.5', active ? 'text-indigo-700' : 'text-slate-700')}>
        {title}
        {recommended && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 font-normal">
            recomendado
          </span>
        )}
      </div>
      <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
    </button>
  )
}
