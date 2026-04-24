/**
 * momentsLibrary — catálogo de momentos comuns pra biblioteca do editor.
 *
 * Exibidos no MomentLibraryModal quando admin clica "+ adicionar momento".
 * Cada item é um preset clicável que vira um registro em ai_agent_moments
 * (admin pode editar depois).
 */

export type LibraryMoment = {
  key: string;
  label: string;
  description: string;
  vertical: 'sales' | 'support' | 'generic';
  suggested: {
    moment_key: string;
    moment_label: string;
    trigger_type: 'primeiro_contato' | 'lead_respondeu' | 'keyword' | 'score_threshold' | 'always';
    trigger_config?: Record<string, unknown>;
    message_mode: 'literal' | 'faithful' | 'free';
    anchor_text?: string;
    red_lines?: string[];
  };
};

export const MOMENTS_LIBRARY: LibraryMoment[] = [
  // --- Gerais
  {
    key: 'abertura',
    label: 'Abertura',
    description: 'Primeira mensagem depois que o lead chega',
    vertical: 'generic',
    suggested: {
      moment_key: 'abertura',
      moment_label: 'Abertura',
      trigger_type: 'primeiro_contato',
      message_mode: 'faithful',
      anchor_text: 'Oi {contact_name}, que bom que você me chamou. Me conta o que você busca?',
      red_lines: ['Não pedir dados pessoais ainda', 'Não mencionar reunião/vídeo', 'Não usar emoji'],
    },
  },
  {
    key: 'sondagem',
    label: 'Sondagem',
    description: 'Entender o que o lead busca com perguntas abertas',
    vertical: 'generic',
    suggested: {
      moment_key: 'sondagem',
      moment_label: 'Sondagem',
      trigger_type: 'lead_respondeu',
      message_mode: 'free',
      anchor_text: 'Uma pergunta por turno, foco em contexto antes de dor. SPIN: Situação → Problema → Implicação.',
      red_lines: ['Uma pergunta por turno', 'Não justificar pergunta', 'Não empilhar perguntas de temas diferentes'],
    },
  },
  // --- Vendas
  {
    key: 'objecao_preco',
    label: 'Objeção de preço',
    description: 'Lead pergunta ou insiste em saber valor',
    vertical: 'sales',
    suggested: {
      moment_key: 'objecao_preco',
      moment_label: 'Objeção de preço',
      trigger_type: 'keyword',
      trigger_config: { keywords: ['preço', 'preco', 'valor', 'quanto custa', 'orçamento', 'orcamento'] },
      message_mode: 'faithful',
      anchor_text: 'Preço é algo que a especialista consegue te passar direito, porque cada projeto a gente desenha sob medida.',
      red_lines: ['Não dar faixa nem âncora de mercado', 'Volta pro que estava entendendo antes'],
    },
  },
  {
    key: 'preciso_pensar',
    label: '"Preciso pensar"',
    description: 'Lead pede tempo sem razão específica',
    vertical: 'sales',
    suggested: {
      moment_key: 'preciso_pensar',
      moment_label: 'Preciso pensar',
      trigger_type: 'keyword',
      trigger_config: { keywords: ['preciso pensar', 'vou pensar', 'me dê um tempo', 'preciso ver'] },
      message_mode: 'faithful',
      anchor_text: 'Claro. Pra eu entender melhor: o que tá pesando mais?',
      red_lines: ['Não insistir', 'Investigar a causa específica'],
    },
  },
  {
    key: 'desfecho_qualificado',
    label: 'Desfecho qualificado',
    description: 'Lead bate critérios mínimos — agenda próximo passo',
    vertical: 'sales',
    suggested: {
      moment_key: 'desfecho_qualificado',
      moment_label: 'Desfecho qualificado',
      trigger_type: 'score_threshold',
      trigger_config: { operator: 'gte', value: 25 },
      message_mode: 'faithful',
      anchor_text: 'Deixa eu conectar você com nossa especialista. Tenho {slot1} ou {slot2}. Qual encaixa?',
      red_lines: ['Não dizer "vou transferir"', 'Não pedir email antes de confirmar horário'],
    },
  },
  {
    key: 'desfecho_nao_qualificado',
    label: 'Desfecho não qualificado',
    description: 'Combinação não fecha — encerra cordial',
    vertical: 'sales',
    suggested: {
      moment_key: 'desfecho_nao_qualificado',
      moment_label: 'Desfecho não qualificado',
      trigger_type: 'always',
      message_mode: 'faithful',
      anchor_text: 'Olha, vou ser honesta. Do jeito que tá, não é o que a gente consegue entregar. Prefiro falar agora.',
      red_lines: ['Não deixar brecha de "mas talvez"', 'Sem drama', 'Sem prometer próxima conversa'],
    },
  },
  // --- Suporte
  {
    key: 'entender_problema',
    label: 'Entender o problema',
    description: 'Cliente descreve o que aconteceu',
    vertical: 'support',
    suggested: {
      moment_key: 'entender_problema',
      moment_label: 'Entender o problema',
      trigger_type: 'lead_respondeu',
      message_mode: 'free',
      anchor_text: 'Deixa o cliente descrever. Faça perguntas mínimas pra diagnosticar.',
      red_lines: ['Não culpar o cliente', 'Não interromper', 'Não presumir a causa'],
    },
  },
  {
    key: 'buscar_solucao',
    label: 'Buscar solução',
    description: 'Busca na base de conhecimento ou propõe solução',
    vertical: 'support',
    suggested: {
      moment_key: 'buscar_solucao',
      moment_label: 'Buscar solução',
      trigger_type: 'always',
      message_mode: 'free',
      anchor_text: 'Propor solução direta. Se não souber, reconhecer e escalar.',
      red_lines: ['Não inventar solução', 'Não prometer prazo sem validar'],
    },
  },
  {
    key: 'confirmar_resolucao',
    label: 'Confirmar resolução',
    description: 'Pergunta se resolveu antes de encerrar',
    vertical: 'support',
    suggested: {
      moment_key: 'confirmar_resolucao',
      moment_label: 'Confirmar resolução',
      trigger_type: 'always',
      message_mode: 'faithful',
      anchor_text: 'Funcionou? Consegue confirmar pra eu fechar aqui?',
      red_lines: ['Não encerrar antes de confirmação explícita'],
    },
  },
  // --- Genéricos
  {
    key: 'pedido_humano',
    label: 'Pedido de humano',
    description: 'Lead quer falar com outra pessoa',
    vertical: 'generic',
    suggested: {
      moment_key: 'pedido_humano',
      moment_label: 'Pedido de humano',
      trigger_type: 'keyword',
      trigger_config: { keywords: ['falar com humano', 'falar com atendente', 'pessoa de verdade', 'atendimento humano'] },
      message_mode: 'faithful',
      anchor_text: 'Sem problema, vou preparar aqui e alguém do time te chama.',
      red_lines: ['Não dizer "vou transferir"'],
    },
  },
];

export function getMomentsByVertical(vertical: 'sales' | 'support' | 'generic' | 'all'): LibraryMoment[] {
  if (vertical === 'all') return MOMENTS_LIBRARY;
  return MOMENTS_LIBRARY.filter(m => m.vertical === vertical || m.vertical === 'generic');
}
