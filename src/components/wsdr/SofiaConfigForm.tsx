import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/Select'
import { StringListEditor } from './StringListEditor'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

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
  { value: 'acolhedor', label: '💚 Acolhedor — quentinha, amigável, acessível' },
  { value: 'formal', label: '🤝 Formal — profissional, respeitoso, estruturado' },
  { value: 'direto', label: '⚡ Direto — assertivo, objetivo, sem rodeios' },
]

export function SofiaConfigForm({
  config,
  onConfigChange,
  onSave,
  isSaving = false,
  saveStatus = 'idle',
  saveMessage = '',
}: SofiaConfigFormProps) {
  const [localConfig, setLocalConfig] = useState<SofiaConfig>(config)

  const handleChange = <K extends keyof SofiaConfig>(field: K, value: SofiaConfig[K]) => {
    const updated = { ...localConfig, [field]: value }
    setLocalConfig(updated)
    onConfigChange(updated)
  }

  const handleSave = async () => {
    await onSave()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
      className="space-y-8"
    >
      {/* Seção: Identidade */}
      <div className="space-y-4 pb-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          👤 Identidade da Sofia
        </h3>
        <p className="text-sm text-slate-600">
          Quem é a Sofia? Nome, empresa, e qual é a proposta dela para os noivos.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Nome da persona
            </label>
            <Input
              type="text"
              value={localConfig.persona_nome}
              onChange={(e) => handleChange('persona_nome', e.target.value)}
              placeholder="ex: Sofia"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Empresa / Marca
            </label>
            <Input
              type="text"
              value={localConfig.empresa}
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
              value={localConfig.proposta}
              onChange={(e) => handleChange('proposta', e.target.value)}
              placeholder="ex: Ajudo casais a planejar o casamento dos sonhos com eficiência e sem estresse."
              className="w-full"
              persistKey="sofia-proposta"
            />
          </div>
        </div>
      </div>

      {/* Seção: Tom de Voz */}
      <div className="space-y-4 pb-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          🎤 Tom de Voz
        </h3>
        <p className="text-sm text-slate-600">
          Como a Sofia fala com os noivos? Escolha o tom que melhor a descreve.
        </p>

        <Select
          value={localConfig.tom}
          onChange={(value) => handleChange('tom', value as 'acolhedor' | 'formal' | 'direto')}
          options={TOM_OPTIONS}
          className="w-full"
        />
      </div>

      {/* Seção: Apresentação */}
      <div className="space-y-4 pb-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          👋 Mensagem de Abertura
        </h3>
        <p className="text-sm text-slate-600">
          Como a Sofia se apresenta no primeiro contato com um noivo? Deixe natural e autêntico.
        </p>

        <Textarea
          value={localConfig.abertura}
          onChange={(e) => handleChange('abertura', e.target.value)}
          placeholder="ex: Oi! Sou a Sofia, da Welcome Weddings. Vi que vocês estão planejando um casamento e gostaria de saber mais sobre o que vocês sonham. Tudo bem?"
          className="w-full"
          persistKey="sofia-abertura"
        />
      </div>

      {/* Seção: Etapas de Qualificação */}
      <div className="space-y-4 pb-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          ❓ Perguntas de Qualificação
        </h3>
        <p className="text-sm text-slate-600">
          Em ordem. A Sofia fará essas perguntas para entender melhor os noivos.
        </p>

        <StringListEditor
          items={localConfig.etapas}
          onChange={(items) => handleChange('etapas', items)}
          placeholder="ex: Qual é a data pretendida do casamento?"
          allowReorder={true}
        />
      </div>

      {/* Seção: Faixas de Orçamento */}
      <div className="space-y-4 pb-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          💰 Faixas de Orçamento
        </h3>
        <p className="text-sm text-slate-600">
          Faixas que a Sofia pode mencionar quando perguntada sobre valor.
        </p>

        <StringListEditor
          items={localConfig.faixas_orcamento}
          onChange={(items) => handleChange('faixas_orcamento', items)}
          placeholder="ex: R$ 80 a 150 mil"
          allowReorder={false}
        />
      </div>

      {/* Seção: Fronteiras / Limites */}
      <div className="space-y-4 pb-6">
        <h3 className="text-lg font-semibold text-slate-900 tracking-tight">
          🛑 Fronteiras (Nunca Faça)
        </h3>
        <p className="text-sm text-slate-600">
          Comportamentos ou tópicos que a Sofia deve evitar completamente.
        </p>

        <StringListEditor
          items={localConfig.fronteiras}
          onChange={(items) => handleChange('fronteiras', items)}
          placeholder="ex: Nunca pressione por decisão imediata"
          allowReorder={false}
        />
      </div>

      {/* Barra de ações */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-200">
        <div className="flex items-center gap-2">
          {saveStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Salvo com sucesso!</span>
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
            '💾 Salvar Configuração'
          )}
        </Button>
      </div>
    </form>
  )
}
