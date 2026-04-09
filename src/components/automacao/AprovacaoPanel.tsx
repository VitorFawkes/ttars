import { useState } from 'react'
import { CheckCircle2, XCircle, Edit3, Eye, MessageSquare, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/textarea'
import { useAutomacaoAprovacoes, type AprovacaoPendente } from '@/hooks/useAutomacaoAprovacoes'
import { toast } from 'sonner'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}

export default function AprovacaoPanel() {
  const { pendentes, isLoading, aprovar, rejeitar } = useAutomacaoAprovacoes()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const handleAprovar = async (item: AprovacaoPendente) => {
    try {
      const corpoFinal = editingId === item.id ? editText : undefined
      await aprovar.mutateAsync({ id: item.id, corpoEditado: corpoFinal })
      setEditingId(null)
      toast.success('Mensagem aprovada e enviada para fila')
    } catch {
      toast.error('Erro ao aprovar')
    }
  }

  const handleRejeitar = async (id: string) => {
    try {
      await rejeitar.mutateAsync({ id })
      toast.success('Mensagem rejeitada')
    } catch {
      toast.error('Erro ao rejeitar')
    }
  }

  const startEdit = (item: AprovacaoPendente) => {
    setEditingId(item.id)
    setEditText(item.corpo_ia_gerado || '')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" />
        Carregando aprovações...
      </div>
    )
  }

  if (pendentes.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-300" />
        <p className="text-sm font-medium">Nenhuma mensagem aguardando aprovação</p>
        <p className="text-xs mt-1">Mensagens geradas por IA com modo aprovação aparecerão aqui</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">
          Aprovações Pendentes
          <span className="ml-2 inline-flex items-center justify-center w-6 h-6 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
            {pendentes.length}
          </span>
        </h3>
      </div>

      {pendentes.map((item) => (
        <div
          key={item.id}
          className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              <div>
                <span className="text-sm font-medium text-slate-900">
                  {item.automacao_regras?.nome || 'Automação'}
                </span>
                <span className="mx-2 text-slate-300">→</span>
                <span className="text-sm text-slate-600">
                  {item.contatos
                    ? `${item.contatos.nome} ${item.contatos.sobrenome || ''}`.trim()
                    : 'Contato'}
                </span>
                {item.cards && (
                  <>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="text-sm text-slate-500">{item.cards.titulo}</span>
                  </>
                )}
              </div>
            </div>
            <span className="text-xs text-slate-400">{timeAgo(item.created_at)}</span>
          </div>

          {/* Message body */}
          <div className="px-4 py-4">
            {editingId === item.id ? (
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                className="w-full text-sm font-mono"
                autoFocus
              />
            ) : (
              <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3">
                <p className="text-sm text-slate-800 whitespace-pre-wrap">
                  {item.corpo_ia_gerado || 'Sem texto gerado'}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="flex gap-2">
              {editingId === item.id ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(null)}
                  className="text-slate-500"
                >
                  Cancelar edição
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEdit(item)}
                  className="gap-1.5 text-slate-600"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </Button>
              )}

              {item.ia_contexto_usado && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-slate-500"
                  onClick={() => {
                    // Could open a modal with full context, for now just log
                    console.log('Contexto IA:', item.ia_contexto_usado)
                    toast.info('Contexto logado no console')
                  }}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver Contexto
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRejeitar(item.id)}
                disabled={rejeitar.isPending}
                className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Rejeitar
              </Button>
              <Button
                size="sm"
                onClick={() => handleAprovar(item)}
                disabled={aprovar.isPending}
                className="gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Aprovar e Enviar
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
