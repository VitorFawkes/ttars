export interface TourStep {
  element: string
  title: string
  description: string
  side?: 'top' | 'right' | 'bottom' | 'left' | 'over'
  align?: 'start' | 'center' | 'end'
}

export interface TourCtx {
  firstName?: string
  destino?: string
}

function greeting(ctx: TourCtx): string {
  const base = ctx.firstName ? `Olá, ${ctx.firstName}!` : 'Olá!'
  if (ctx.destino) {
    return `${base} Esta é a sua proposta para ${ctx.destino}.`
  }
  return `${base} Esta é a sua proposta de viagem.`
}

export function desktopSteps(ctx: TourCtx): TourStep[] {
  return [
    {
      element: '[data-tour="hero"]',
      title: greeting(ctx),
      description:
        'Aqui você vê o resumo da viagem. Role a página pra baixo pra conhecer cada parte (hospedagem, voos, passeios e etc). Você vai precisar <strong>escolher e clicar em algumas coisas</strong> antes de aceitar.',
      side: 'bottom',
      align: 'center',
    },
    {
      element: '[data-tour="section-required"]',
      title: 'O que você precisa escolher',
      description:
        'Onde aparecer <strong>"Escolha 1 opção"</strong> (ou "Escolha 1 ou mais"), você precisa <strong>clicar num dos cards</strong> pra escolher. Sem isso a proposta não pode ser aceita.<br><br>Alguns cards têm opções extras dentro (tipos de quarto, horários de voo, categorias) — clique pra abrir e ver tudo.',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-tour="section-optional"]',
      title: 'Os extras (opcionais)',
      description:
        'Itens marcados como <strong>"Adicione o que quiser"</strong> são extras. Clique pra incluir, clique de novo pra tirar. O total atualiza sozinho a cada escolha.',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-tour="comment-btn"]',
      title: 'Dúvida em algum item?',
      description:
        'Clique no ícone de comentário pra deixar uma observação sobre algum hotel, voo ou passeio específico. Sua consultora recebe direto. Tem também um botão de comentário geral no rodapé da coluna ao lado.',
      side: 'left',
      align: 'center',
    },
    {
      element: '[data-tour="sidebar-total"]',
      title: 'Resumo e total',
      description:
        'Tudo que você selecionar aparece aqui com o preço. O total da viagem atualiza em tempo real — sempre dá pra ver o que está incluído antes de aceitar.',
      side: 'left',
      align: 'center',
    },
    {
      element: '[data-tour="accept-btn"]',
      title: 'Tudo certo?',
      description:
        'Quando estiver feliz com suas escolhas, clique em <strong>"Aceitar Proposta"</strong>. Sua consultora é avisada na hora. Se o botão estiver cinza, ainda falta escolher algum item obrigatório.',
      side: 'left',
      align: 'end',
    },
  ]
}

export function mobileSteps(ctx: TourCtx): TourStep[] {
  return [
    {
      element: '[data-tour="hero"]',
      title: greeting(ctx),
      description:
        'Aqui você vê o resumo da viagem. Deslize pra baixo pra ver cada parte. Você vai precisar <strong>escolher e tocar em algumas coisas</strong> antes de aceitar.',
      side: 'bottom',
      align: 'center',
    },
    {
      element: '[data-tour="section-required"]',
      title: 'O que você precisa escolher',
      description:
        'Onde aparecer <strong>"Obrigatório"</strong> ou "Escolha 1 opção", você precisa <strong>tocar num dos cards</strong> pra escolher.<br><br>Alguns cards têm opções dentro (tipos de quarto, horários de voo) — toque pra abrir e ver.',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-tour="section-optional"]',
      title: 'Os extras (opcionais)',
      description:
        'Itens marcados como <strong>"Opcional"</strong> são extras. Toque pra incluir, toque de novo pra tirar. O total no rodapé atualiza sozinho.',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-tour="comment-btn"]',
      title: 'Dúvida em algum item?',
      description:
        'Toque no ícone de comentário pra deixar uma observação sobre algum hotel, voo ou passeio. Sua consultora recebe direto.',
      side: 'bottom',
      align: 'end',
    },
    {
      element: '[data-tour="footer-total"]',
      title: 'Resumo e total',
      description:
        'O total da viagem fica aqui embaixo e atualiza em tempo real conforme você seleciona itens. Sempre visível.',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-tour="accept-btn"]',
      title: 'Tudo certo?',
      description:
        'Quando estiver feliz com suas escolhas, toque em <strong>"Aceitar Proposta"</strong>. Sua consultora é avisada na hora. Se o botão estiver cinza, ainda falta escolher algum item obrigatório.',
      side: 'top',
      align: 'end',
    },
  ]
}
