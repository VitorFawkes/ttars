import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Bot, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'

export default function JuliaIAConfig() {
  const navigate = useNavigate()

  const { data: juliaAgent, isLoading } = useQuery({
    queryKey: ['julia-agent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('id, nome, ativa')
        .eq('nome', 'Julia')
        .single()
      if (error) return null
      return data
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400 mr-2" />
        <span className="text-sm text-slate-500">Carregando...</span>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-start gap-4">
      <div className="p-3 rounded-lg bg-orange-50 flex-shrink-0">
        <Bot className="h-6 w-6 text-orange-600" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-slate-900">Julia IA</h3>
        <p className="text-sm text-slate-600 mt-1">
          A configuração da Julia agora vive em Agentes IA, junto com Luna e outros agentes. Acesse lá para editar suas linhas WhatsApp, ativar/desativar, e visualizar conversas.
        </p>
        {juliaAgent && (
          <p className="text-xs text-slate-500 mt-2">
            Status: <span className={juliaAgent.ativa ? 'text-green-600 font-medium' : 'text-slate-500 font-medium'}>
              {juliaAgent.ativa ? '● Ativa' : '○ Pausada'}
            </span>
          </p>
        )}
        {juliaAgent && (
          <Button
            onClick={() => navigate(`/settings/ai-agents/${juliaAgent.id}`)}
            className="mt-4 gap-2"
          >
            Acessar Julia em Agentes IA
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
