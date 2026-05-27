import { useState } from 'react'
import { Check, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useStatusEnvioPublic, useMarcarProntoPublic } from '../../../hooks/convidados/casais/useCasalEnvios'

interface Props { codigo: string; totalPessoas: number }

export function BotaoFinalizarLista({ codigo, totalPessoas }: Props) {
  const { data: status, isLoading } = useStatusEnvioPublic(codigo)
  const marcar = useMarcarProntoPublic(codigo)
  const [justSent, setJustSent] = useState(false)

  const handleClick = async () => {
    if (totalPessoas === 0) return
    try {
      await marcar.mutateAsync()
      setJustSent(true)
      setTimeout(() => setJustSent(false), 3000)
    } catch { /* error treatable via parent */ }
  }

  if (isLoading || !status) return null
  if (totalPessoas === 0) return null

  const nuncaEnviou = status.nunca_enviou
  const temPendente = status.tem_alteracoes_pendentes
  const formatadoEnvio = status.enviado_em
    ? new Date(status.enviado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null

  return (
    <div className="bg-white border border-ww-sand rounded-xl shadow-ww-lift p-5 md:p-6 mt-6 mx-6 mb-2">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="flex-1 min-w-0">
          {nuncaEnviou ? (
            <>
              <div className="inline-flex items-center gap-1.5 mb-1">
                <Sparkles className="w-4 h-4 text-ww-gold" />
                <h3 className="font-ww-serif italic text-lg text-ww-n700">Quando terminar, avise a equipe</h3>
              </div>
              <p className="text-sm text-ww-n500">
                Suas alterações salvam sozinhas, mas a equipe só vai trabalhar na lista quando você
                clicar abaixo. Você pode voltar e mexer depois sempre que quiser.
              </p>
            </>
          ) : temPendente ? (
            <>
              <div className="inline-flex items-center gap-1.5 mb-1">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <h3 className="font-ww-serif italic text-lg text-ww-n700">Você editou depois de enviar</h3>
              </div>
              <p className="text-sm text-ww-n500">
                Sua última versão foi enviada em <strong>{formatadoEnvio}</strong>. Você mexeu na
                lista depois disso — clique abaixo para a equipe saber das mudanças.
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="font-ww-serif italic text-lg text-ww-n700">Lista enviada para a equipe</h3>
              </div>
              <p className="text-sm text-ww-n500">
                Você enviou esta versão em <strong>{formatadoEnvio}</strong>. Se mexer em algo, é só
                clicar de novo abaixo.
              </p>
            </>
          )}
        </div>
        <button type="button" onClick={handleClick}
          disabled={marcar.isPending || (!nuncaEnviou && !temPendente)}
          className={cn('inline-flex items-center justify-center gap-2 px-5 h-12 rounded-full text-sm font-semibold transition-all ease-ww-soft duration-200 shrink-0',
            justSent ? 'bg-emerald-600 text-white'
              : nuncaEnviou || temPendente ? 'bg-ww-gold text-white hover:bg-ww-gold-ink shadow-md hover:shadow-ww-lift hover:-translate-y-0.5'
              : 'bg-ww-cream text-ww-n500 cursor-default')}>
          {marcar.isPending ? <Loader2 className="w-4 h-4 animate-spin" />
            : justSent ? <CheckCircle2 className="w-4 h-4" />
            : <Check className="w-4 h-4" />}
          {justSent ? 'Obrigado! Avisamos a equipe'
            : nuncaEnviou ? 'Pronto, podem usar a lista'
            : temPendente ? 'Avisar a equipe sobre as mudanças'
            : 'Lista enviada'}
        </button>
      </div>
    </div>
  )
}
