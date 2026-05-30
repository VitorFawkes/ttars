import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { StringListEditor } from './StringListEditor'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  Mic,
  MessageSquare,
  ListChecks,
  Wallet,
  ShieldAlert,
} from 'lucide-react'

export interface SofiaConfig {
  persona_nome: string
  empresa: string
  proposta: string
  tom: 'acolhedor' | 'formal' | 'direto'
  abertura: string
  etapas: string[]
  faixas_orcamento: string[]
  fronteiras: string[]
}

interface SofiaConfigFormProps {
  config: SofiaConfig
  onConfigChange: (config: SofiaConfig) => void
  onSave: () => Promise<void>
  isSaving?: boolean
  saveStatus?: 'idle' | 'success' | 'error'
  saveMessage?: string
}

const TOM_OPTIONS = [
  { value: 'acolhedor', label: 'Acolhedor — caloroso, próximo, humano' },
  { value: 'formal', label: 'Formal — profissional, respeitoso, sóbrio' },
  { value: 'direto', label: 'Direto — assertivo, objetivo, sem rodeios' },
]

function Section({
  icon,
  title,
  description,
  children,
  last = false,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div className={last ? 'space-y-4' : 'space-y-4 pb-6 border-b border-slate-200'}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">{icon}</span>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h3>
        </div>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function SofiaConfigForm({
  config,
  onConfigChange,
  onSave,
  isSaving = false,
  saveStatus = 'idle',
  saveMessage = '',
}: SofiaConfigFormProps) {
  const handleChange = <K extends keyof SofiaConfig>(field: K, value: SofiaConfig[K]) => {
    onConfigChange({ ...config, [field]: value })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
      className="space-y-8"
    >
      <Section
        icon={<User className="w-4 h-4" />}
        title="Identidade"
        description="Quem é a Sofia: nome, marca e a proposta que ela leva para os noivos."
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">Nome da persona</label>
            <Input
              type="text"
              value={config.persona_nome}
              onChange={(e) => handleChange('persona_nome', e.target.value)}
              placeholder="ex: Sofia"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">Empresa / marca</label>
            <Input
              type="text"
              value={config.empresa}
              onChange={(e) => handleChange('empresa', e.target.value)}
              placeholder="ex: Welcome Weddings"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Proposta (pitch em 1-2 frases)
            </label>
            <Textarea
              value={config.proposta}
              onChange={(e) => handleChange('proposta', e.target.value)}
              placeholder="ex: a gente faz destination wedding desde 2012, premiada como uma das melhores da América Latina."
              className="w-full"
              persistKey="sofia-proposta"
            />
          </div>
        </div>
      </Section>

      <Section
        icon={<Mic className="w-4 h-4" />}
        title="Tom de voz"
        description="Como a Sofia fala com os noivos."
      >
        <Select
          value={config.tom}
          onChange={(value) => handleChange('tom', value as SofiaConfig['tom'])}
          options={TOM_OPTIONS}
          className="w-full"
        />
      </Section>

      <Section
        icon={<MessageSquare className="w-4 h-4" />}
        title="Mensagem de abertura"
        description="A primeira mensagem que a Sofia manda no primeiro contato."
      >
        <Textarea
          value={config.abertura}
          onChange={(e) => handleChange('abertura', e.target.value)}
          placeholder="ex: Oi! Aqui é a Sofia, da Welcome Weddings. Pra começar, como é o nome de vocês?"
          className="w-full min-h-[120px]"
          persistKey="sofia-abertura"
        />
      </Section>

      <Section
        icon={<ListChecks className="w-4 h-4" />}
        title="Perguntas de qualificação"
        description="Em ordem. A Sofia avança uma de cada vez para entender o casal."
      >
        <StringListEditor
          items={config.etapas}
          onChange={(items) => handleChange('etapas', items)}
          placeholder="ex: Qual é a data pretendida do casamento?"
          allowReorder={true}
        />
      </Section>

      <Section
        icon={<Wallet className="w-4 h-4" />}
        title="Faixas de orçamento"
        description="Faixas que a Sofia pode oferecer se o casal não quiser dizer um valor."
      >
        <StringListEditor
          items={config.faixas_orcamento}
          onChange={(items) => handleChange('faixas_orcamento', items)}
          placeholder="ex: R$ 80 a 150 mil"
          allowReorder={false}
        />
      </Section>

      <Section
        icon={<ShieldAlert className="w-4 h-4" />}
        title="Fronteiras (nunca faça)"
        description="O que a Sofia deve evitar por completo."
        last
      >
        <StringListEditor
          items={config.fronteiras}
          onChange={(items) => handleChange('fronteiras', items)}
          placeholder="ex: Nunca dar preço fechado — remeter à Wedding Planner"
          allowReorder={false}
        />
      </Section>

      {/* Barra de ações */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-200">
        <div className="flex items-center gap-2">
          {saveStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Salvo com sucesso</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">{saveMessage || 'Erro ao salvar'}</span>
            </div>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSaving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar configuração'
          )}
        </Button>
      </div>
    </form>
  )
}
