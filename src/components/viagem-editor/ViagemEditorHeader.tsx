import { useState } from 'react'
import { ArrowLeft, Check, Copy, ExternalLink, Link2, Send, Users } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { ViagemInternaRow } from '@/hooks/viagem/useViagemInterna'
import { useEnviarViagem } from '@/hooks/viagem/useViagemInterna'

const ESTADO_LABEL: Record<string, string> = {
  desenho: 'Desenho',
  em_recomendacao: 'Em recomendação',
  em_aprovacao: 'Em aprovação',
  confirmada: 'Confirmada',
  em_montagem: 'Em montagem',
  aguardando_embarque: 'Aguardando embarque',
  em_andamento: 'Em andamento',
  pos_viagem: 'Pós-viagem',
  concluida: 'Concluída',
}

const ESTADO_COLOR: Record<string, string> = {
  desenho: 'bg-slate-100 text-slate-700',
  em_recomendacao: 'bg-blue-100 text-blue-700',
  em_aprovacao: 'bg-indigo-100 text-indigo-700',
  confirmada: 'bg-emerald-100 text-emerald-700',
  em_montagem: 'bg-violet-100 text-violet-700',
  aguardando_embarque: 'bg-amber-100 text-amber-700',
  em_andamento: 'bg-orange-100 text-orange-700',
  pos_viagem: 'bg-slate-100 text-slate-700',
  concluida: 'bg-slate-200 text-slate-800',
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

function publicUrl(token: string) {
  if (typeof window === 'undefined') return `/v/${token}`
  return `${window.location.origin}/v/${token}`
}

interface Props {
  viagem: ViagemInternaRow
  context: 'card' | 'standalone'
  cardTitulo?: string | null
  onAtrelarClick?: () => void
}

export function ViagemEditorHeader({ viagem, context, cardTitulo, onAtrelarClick }: Props) {
  const navigate = useNavigate()
  const enviarViagem = useEnviarViagem()
  const [copied, setCopied] = useState(false)

  const label = ESTADO_LABEL[viagem.estado] ?? viagem.estado
  const color = ESTADO_COLOR[viagem.estado] ?? 'bg-slate-100 text-slate-700'
  const url = publicUrl(viagem.public_token)

  const handleBack = () => {
    if (context === 'card' && viagem.card_id) {
      navigate(`/cards/${viagem.card_id}`)
    } else {
      navigate('/viagens')
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar o link')
    }
  }

  const handleEnviar = () => {
    enviarViagem.mutate(viagem.id, {
      onSuccess: (result) => {
        const msg = viagem.estado === 'em_recomendacao'
          ? 'Link do cliente atualizado.'
          : `Sua viagem está pronta: ${url}`
        const whatsappText = encodeURIComponent(`Oi! ${msg}`)
        if (result.itens_promovidos > 0) {
          window.open(`https://wa.me/?text=${whatsappText}`, '_blank')
        }
      },
    })
  }

  const podeEnviar = viagem.estado === 'desenho' || viagem.estado === 'em_recomendacao'
  const reenvio = viagem.estado === 'em_recomendacao'

  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="h-6 w-px bg-slate-200" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-slate-900">
              {viagem.titulo || 'Viagem sem título'}
            </h1>
            <Badge variant="outline" className={`${color} border-0`}>
              {label}
            </Badge>
          </div>
          {viagem.subtitulo && (
            <p className="truncate text-xs text-slate-500">{viagem.subtitulo}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right text-xs text-slate-600 md:block">
          <div>Total estimado: <span className="font-medium text-slate-900">{formatBRL(viagem.total_estimado)}</span></div>
          {viagem.total_aprovado > 0 && (
            <div>Aprovado: <span className="font-medium text-emerald-700">{formatBRL(viagem.total_aprovado)}</span></div>
          )}
        </div>
        <div className="hidden h-6 w-px bg-slate-200 md:block" />

        {context === 'standalone' && viagem.card_id && cardTitulo && (
          <Link
            to={`/cards/${viagem.card_id}`}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span className="max-w-[240px] truncate">{cardTitulo}</span>
          </Link>
        )}

        {context === 'standalone' && !viagem.card_id && (
          <Button size="sm" variant="outline" onClick={onAtrelarClick} className="gap-1">
            <Users className="h-3.5 w-3.5" />
            Atrelar a um card
          </Button>
        )}

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          title="Copiar link do cliente"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar link'}
        </button>

        <a
          href={`/v/${viagem.public_token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          title="Abrir página do cliente"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Preview
        </a>

        {podeEnviar && (
          <Button
            size="sm"
            onClick={handleEnviar}
            disabled={enviarViagem.isPending}
            className="gap-1"
          >
            <Send className="h-3.5 w-3.5" />
            {enviarViagem.isPending
              ? 'Enviando...'
              : reenvio
                ? 'Reenviar ao cliente'
                : 'Enviar ao cliente'}
          </Button>
        )}
      </div>
    </div>
  )
}
