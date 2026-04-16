import type { ViagemEstado } from '@/types/viagem'
import { Sparkles, PartyPopper, Plane, Heart } from 'lucide-react'

const ESTADO_HERO: Record<ViagemEstado, { label: string; color: string; icon: typeof Sparkles } | null> = {
  desenho: null,
  em_recomendacao: { label: 'Nova proposta para você', color: 'text-indigo-100', icon: Sparkles },
  em_aprovacao: { label: 'Sua proposta de viagem', color: 'text-indigo-100', icon: Sparkles },
  confirmada: { label: 'Viagem confirmada!', color: 'text-emerald-100', icon: PartyPopper },
  em_montagem: { label: 'Preparando sua viagem', color: 'text-violet-100', icon: Sparkles },
  aguardando_embarque: { label: 'Quase lá!', color: 'text-sky-100', icon: Plane },
  em_andamento: { label: 'Boa viagem!', color: 'text-emerald-100', icon: Plane },
  pos_viagem: { label: 'Bem-vindo de volta!', color: 'text-amber-100', icon: Heart },
  concluida: { label: 'Sua viagem', color: 'text-slate-200', icon: Heart },
}

interface ViagemHeroProps {
  titulo: string | null
  subtitulo: string | null
  capaUrl: string | null
  estado: ViagemEstado
}

export function ViagemHero({ titulo, subtitulo, capaUrl, estado }: ViagemHeroProps) {
  const config = ESTADO_HERO[estado]

  return (
    <div className="relative overflow-hidden rounded-b-2xl">
      {/* Background */}
      {capaUrl ? (
        <img
          src={capaUrl}
          alt={titulo ?? 'Viagem'}
          className="w-full aspect-[16/9] object-cover"
        />
      ) : (
        <div className="w-full aspect-[16/9] bg-gradient-to-br from-indigo-600 to-violet-700" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5 space-y-1">
        {config && (
          <div className={`flex items-center gap-1.5 ${config.color}`}>
            <config.icon className="h-3.5 w-3.5" />
            <span className="text-xs font-medium uppercase tracking-wider">
              {config.label}
            </span>
          </div>
        )}
        <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
          {titulo ?? 'Sua Viagem'}
        </h1>
        {subtitulo && (
          <p className="text-sm text-white/80">{subtitulo}</p>
        )}
      </div>
    </div>
  )
}
