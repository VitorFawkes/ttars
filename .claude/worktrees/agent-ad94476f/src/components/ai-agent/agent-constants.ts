import {
  Sparkles, HeadphonesIcon, ShieldCheck, Brain, ArrowRightLeft,
} from 'lucide-react'
import type { AgentTipo } from '@/hooks/useAiAgents'

export const TIPO_CONFIG: Record<AgentTipo, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  accent: string
}> = {
  sales: { label: 'Vendas', icon: Sparkles, color: 'bg-green-100 text-green-700 border-green-200', accent: 'bg-green-500' },
  support: { label: 'Suporte', icon: HeadphonesIcon, color: 'bg-blue-100 text-blue-700 border-blue-200', accent: 'bg-blue-500' },
  success: { label: 'Sucesso', icon: ShieldCheck, color: 'bg-purple-100 text-purple-700 border-purple-200', accent: 'bg-purple-500' },
  specialist: { label: 'Especialista', icon: Brain, color: 'bg-amber-100 text-amber-700 border-amber-200', accent: 'bg-amber-500' },
  router: { label: 'Roteador', icon: ArrowRightLeft, color: 'bg-slate-100 text-slate-700 border-slate-200', accent: 'bg-slate-500' },
}

export type Tone = 'formal' | 'professional' | 'friendly' | 'casual' | 'empathetic'

export interface ToneOption {
  value: Tone
  label: string
  description: string
  example: string
}

export const TONE_OPTIONS: ToneOption[] = [
  {
    value: 'professional',
    label: 'Profissional',
    description: 'Educado, claro, objetivo',
    example: 'Olá! Obrigada pelo contato. Para te ajudar melhor, me conta: pra onde vocês querem viajar?',
  },
  {
    value: 'friendly',
    label: 'Amigável',
    description: 'Caloroso e próximo — como um amigo',
    example: 'Oi! Que legal que você procurou a gente! Me conta, pra onde vocês estão pensando em ir?',
  },
  {
    value: 'casual',
    label: 'Casual',
    description: 'Descontraído e descompromissado',
    example: 'Oie! Bora falar de viagem? Me diz aí: qual o destino dos sonhos?',
  },
  {
    value: 'formal',
    label: 'Formal',
    description: 'Sofisticado — para clientela premium',
    example: 'Boa tarde. Agradeço pelo contato. Poderia me informar o destino desejado e o período da viagem?',
  },
  {
    value: 'empathetic',
    label: 'Empático',
    description: 'Acolhedor e atencioso',
    example: 'Oi, tudo bem? Fico feliz que tenha chegado até aqui. Me conta, o que você está buscando pra essa viagem?',
  },
]
