export interface SimulatorPreset {
  id: string
  label: string
  icon: string
  description: string
  contact_name: string
  contact_role?: 'primary' | 'traveler'
  pessoa_principal_nome?: string
  existing_context?: string
  message: string
}

export const SIMULATOR_PRESETS: SimulatorPreset[] = [
  {
    id: 'first_contact',
    label: 'Primeiro contato',
    icon: '👋',
    description: 'Lead novo, sem histórico',
    contact_name: 'Maria Silva',
    message: 'Oi, vi o anúncio de vocês e queria saber mais sobre viagens pra Europa',
  },
  {
    id: 'club_med',
    label: 'Club Med',
    icon: '🏖️',
    description: 'Cenário especial — deve pular taxa e agendamento',
    contact_name: 'João Santos',
    message: 'Boa tarde! Estou interessado no Club Med Trancoso, vocês fazem?',
  },
  {
    id: 'low_budget',
    label: 'Orçamento baixo',
    icon: '💰',
    description: 'Não deve desqualificar por orçamento',
    contact_name: 'Ana Costa',
    message: 'Oi, quero viajar pra Cancun mas meu orçamento é bem apertado',
  },
  {
    id: 'group_trip',
    label: 'Grupo grande',
    icon: '👥',
    description: '10+ pessoas — atenção especial, não rejeitar',
    contact_name: 'Pedro Lima',
    message: 'Olá! Somos um grupo de 15 pessoas querendo ir pra Toscana em setembro',
  },
  {
    id: 'traveler',
    label: 'Viajante secundário',
    icon: '🧳',
    description: 'Acompanhante — não deve falar de preço ou agenda',
    contact_name: 'Lucas Silva',
    contact_role: 'traveler',
    pessoa_principal_nome: 'Maria Silva',
    message: 'Oi, a Maria pediu pra eu enviar meu passaporte pra viagem',
  },
  {
    id: 'returning',
    label: 'Cliente retornando',
    icon: '🔄',
    description: 'Já tem contexto — agente deve usar',
    contact_name: 'Carla Souza',
    existing_context: 'Destino: Maldivas, 2 pessoas, lua de mel, orçamento 30k',
    message: 'Oi, pensei melhor e quero mudar pra Bora Bora em vez de Maldivas',
  },
  {
    id: 'disqualification',
    label: 'Só quer roteiro grátis',
    icon: '🚫',
    description: 'Caso de desqualificação válida',
    contact_name: 'Roberto Dias',
    message: 'Oi, já tenho hotel e voo, só quero um roteiro gratuito mesmo',
  },
  {
    id: 'pede_humano',
    label: 'Pede atendente humano',
    icon: '🙋',
    description: 'Deve escalar para humano',
    contact_name: 'Juliana Rocha',
    message: 'Quero falar com um atendente humano, por favor',
  },
]
