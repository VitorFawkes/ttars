import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/lib/supabase'

// wsdr_agent_config ainda não está nos tipos gerados (módulo novo isolado).
// Cliente sem tipos só para estas queries — evita `any` e mantém o lint limpo.
const db = supabase as unknown as SupabaseClient
import { SofiaConfigForm, type SofiaConfig } from '@/components/wsdr/SofiaConfigForm'
import { ConversationTester } from '@/components/wsdr/ConversationTester'
import { Skeleton } from '@/components/ui/Skeleton'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const DEFAULT_CONFIG: SofiaConfig = {
  persona_nome: 'Sofia',
  empresa: 'Welcome Weddings',
  proposta: 'Ajudo casais a planejar o casamento dos sonhos com eficiência e sem estresse.',
  tom: 'acolhedor',
  abertura:
    'Oi! Sou a Sofia, da Welcome Weddings. Vi que vocês estão planejando um casamento e gostaria de saber mais sobre o que vocês sonham. Tudo bem?',
  etapas: [
    'Qual é a data pretendida do casamento?',
    'Quantos convidados vocês estão pensando em chamar?',
    'Qual é o estilo do casamento que vocês imaginam?',
  ],
  faixas_orcamento: ['R$ 80 a 150 mil', 'R$ 150 a 300 mil', 'R$ 300 mil+'],
  fronteiras: [
    'Nunca pressione por uma decisão imediata',
    'Evite mencionar competidores nomes específicos',
    'Não fale mal do casal ou de suas escolhas',
  ],
}

export default function SdrConfigPage() {
  const { org } = useOrg()
  const [config, setConfig] = useState<SofiaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState('')

  // Carregar configuração
  useEffect(() => {
    const loadConfig = async () => {
      if (!org?.id) return

      try {
        const { data, error } = await db
          .from('wsdr_agent_config')
          .select('config')
          .eq('slug', 'sofia-weddings')
          .eq('org_id', org.id)
          .maybeSingle()

        if (error) {
          console.error('Erro ao carregar config:', error)
          setSaveStatus('error')
          setSaveMessage(error.message)
          setConfig(DEFAULT_CONFIG)
          return
        }

        const loadedConfig = data?.config as SofiaConfig | undefined
        setConfig(loadedConfig || DEFAULT_CONFIG)
        setSaveStatus('idle')
      } catch (err) {
        console.error('Erro inesperado:', err)
        setConfig(DEFAULT_CONFIG)
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [org?.id])

  const handleSave = async () => {
    if (!config || !org?.id) return

    setSaving(true)
    setSaveStatus('idle')

    try {
      const { error } = await db
        .from('wsdr_agent_config')
        .update({ config })
        .eq('slug', 'sofia-weddings')
        .eq('org_id', org.id)

      if (error) {
        setSaveStatus('error')
        setSaveMessage(error.message)
        toast.error('Erro ao salvar', { description: error.message })
        return
      }

      setSaveStatus('success')
      toast.success('Configuração salva!')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      setSaveStatus('error')
      setSaveMessage(message)
      toast.error('Erro ao salvar', { description: message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Erro ao carregar</h3>
              <p className="text-sm text-red-700 mt-1">
                Não foi possível carregar a configuração da Sofia. Tente recarregar a página.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            ✨ Configuração da Sofia
          </h1>
          <p className="text-slate-600 mt-2">
            SDR de Casamentos — edite como a Sofia conversa com os noivos. As mudanças valem na próxima
            mensagem.
          </p>
        </div>

        {/* Formulário principal */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
          <SofiaConfigForm
            config={config}
            onConfigChange={setConfig}
            onSave={handleSave}
            isSaving={saving}
            saveStatus={saveStatus}
            saveMessage={saveMessage}
          />
        </div>

        {/* Painel de teste */}
        <ConversationTester configSaved={saveStatus === 'success' || (saveStatus === 'idle' && config !== DEFAULT_CONFIG)} />

        {/* Footer */}
        <div className="text-center text-sm text-slate-500 pb-8">
          <p>Configuração exclusiva para Welcome Weddings</p>
        </div>
      </div>
    </div>
  )
}
