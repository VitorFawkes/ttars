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

// Fallback usado só se a config ainda não existir no banco. Mantido idêntico ao
// seed da Sofia (posicionamento real, sem clichê) para que o fallback nunca
// contradiga as próprias fronteiras dela.
const DEFAULT_CONFIG: SofiaConfig = {
  persona_nome: 'Sofia',
  empresa: 'Welcome Weddings',
  proposta:
    'a gente faz destination wedding desde 2012 e já foi premiada como uma das melhores produtoras de destination wedding da América Latina',
  tom: 'acolhedor',
  abertura:
    'Oi! Aqui é a Sofia, da Welcome Weddings, tudo bem? Como é o nome de vocês? A gente faz destination wedding desde 2012 e já foi premiada como uma das melhores produtoras de destination wedding da América Latina. A ideia aqui é uma conversa rápida pra eu entender o que vocês esperam, tirar dúvidas e, se fizer sentido, marcar um papo com a nossa Wedding Planner. Pra começar: o que é o casamento pra vocês, e como vocês imaginam ele?',
  etapas: [
    'O que é o casamento pra vocês e como imaginam ele',
    'Destino ou região',
    'Número de convidados (estimado)',
    'Faixa de investimento / orçamento',
  ],
  faixas_orcamento: ['R$ 80 a 150 mil', 'R$ 150 a 250 mil', 'R$ 250 a 400 mil', 'R$ 400 mil ou mais'],
  fronteiras: [
    'Nunca dar preço fechado nem chutar valor — remeter à Wedding Planner',
    'Nunca inventar data ou horário de reunião — perguntar o melhor período e dizer que reserva com a Planner',
    'Nunca usar clichê (casamento dos sonhos, experiência premium, pode deixar com a gente)',
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
      // upsert (não update) para que dê pra montar o agente do zero: se a org
      // ainda não tem linha, cria; se já tem, atualiza. onConflict no par único.
      const { error } = await db
        .from('wsdr_agent_config')
        .upsert(
          { org_id: org.id, slug: 'sofia-weddings', config },
          { onConflict: 'org_id,slug' }
        )

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
      <div className="h-full overflow-y-auto bg-slate-50 p-8">
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
      <div className="h-full overflow-y-auto bg-slate-50 p-8">
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
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Configuração da Sofia</h1>
          <p className="text-slate-500 mt-2">
            A Sofia é a SDR de casamentos no WhatsApp. Edite como ela conversa com os noivos — as
            mudanças valem na próxima mensagem.
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
        <ConversationTester />

        {/* Footer */}
        <div className="text-center text-sm text-slate-400 pb-8">
          <p>Configuração exclusiva da Welcome Weddings</p>
        </div>
      </div>
    </div>
  )
}
