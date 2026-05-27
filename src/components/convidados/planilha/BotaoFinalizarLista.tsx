import { useState } from 'react'
import { Check, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  useStatusEnvioPublic,
  useMarcarProntoPublic,
} from '../../../hooks/convidados/casais/useCasalEnvios'

interface Props {
  codigo: string
  totalPessoas: number
}

/**
 * Botão "Pronto" compacto pra usar dentro do footer fixo.
 *
 * Estados:
 *  - Sem pessoas / loading           → apagado, disabled
 *  - Nunca enviou                    → ATIVO  "Pronto"          (gold)
 *  - Já enviou e nada mudou          → APAGADO "Lista enviada"  (cinza, disabled)
 *  - Editou depois de enviar         → ATIVO destacado "Avisar mudanças" (gold + ring âmbar)
 *  - Recém-clicou                    → SUCESSO "Obrigado!"      (verde)
 */
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
    } catch { /* erro vai para toast no parent */ }
  }

  const nuncaEnviou = status?.nunca_enviou ?? true
  const temPendente = status?.tem_alteracoes_pendentes ?? false
  const formatadoEnvio = status?.enviado_em
    ? new Date(status.enviado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null

  const semPessoas = totalPessoas === 0
  const ativo = !semPessoas && !isLoading && (nuncaEnviou || temPendente)
  const destaque = ativo && temPendente

  let label = 'Pronto'
  let icon: React.ReactNode = <Check className="w-4 h-4" />

  if (justSent) {
    label = 'Obrigado!'
    icon = <CheckCircle2 className="w-4 h-4" />
  } else if (marcar.isPending) {
    label = 'Enviando…'
    icon = <Loader2 className="w-4 h-4 animate-spin" />
  } else if (semPessoas || nuncaEnviou) {
    label = 'Pronto'
  } else if (temPendente) {
    label = 'Avisar mudanças'
    icon = <AlertCircle className="w-4 h-4" />
  } else if (formatadoEnvio) {
    label = `Enviado em ${formatadoEnvio}`
    icon = <CheckCircle2 className="w-4 h-4" />
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!ativo || marcar.isPending}
      className={cn(
        'inline-flex items-center justify-center gap-2 px-4 h-10 rounded-full text-sm font-semibold transition-all ease-ww-soft duration-200 whitespace-nowrap',
        justSent && 'bg-emerald-600 text-white shadow-md',
        !justSent && destaque && 'bg-ww-gold text-white shadow-md ring-2 ring-amber-300 ring-offset-2 ring-offset-white hover:bg-ww-gold-ink',
        !justSent && !destaque && ativo && 'bg-ww-gold text-white shadow-sm hover:bg-ww-gold-ink hover:shadow-md',
        !justSent && !ativo && 'bg-ww-cream text-ww-n400 cursor-default opacity-70',
      )}
      title={
        semPessoas ? 'Adicione pelo menos uma pessoa primeiro'
        : nuncaEnviou ? 'Avise a equipe que sua lista está pronta'
        : temPendente ? 'Você editou após enviar — avise a equipe sobre as mudanças'
        : 'Lista enviada à equipe'
      }
    >
      {icon}
      {label}
    </button>
  )
}
