# Daily 07/05 — backlog do Mateus

Anotações da daily organizadas. Tudo aqui é meu — alguns itens vão sair
agora, outros num lote separado por serem mais complexos.

## Concierge — sub-cards × card principal

Hoje cada sub-card (nova venda/mudança dentro de uma viagem) tem suas
próprias tarefas e atendimentos. O concierge perde o contexto da viagem
inteira porque vê só o sub-card. Decisão: a tarefa continua morando no
sub-card onde nasceu (fonte da verdade), mas o card principal espelha
read-only e o kanban `/concierge` exibe o principal como "viagem".

1. **Tarefas de sub-card espelhadas no card principal.** No card principal,
   listar também as tarefas dos sub-cards. Concluir e excluir continuam
   acontecendo no sub-card original — o principal só lê.
2. **Atendimento concierge sempre exibe o card principal.** No kanban
   `/concierge` e em qualquer visualização derivada, a coluna "viagem"
   mostra o card principal, nunca o sub-card.

## Modal de novo atendimento — 1 módulo por atendimento

Hoje o modo múltiplo é uma textarea (um título por linha) e todos os
atendimentos criados compartilham tipo, categoria, prazo e dono. Mudar
para uma lista de blocos onde cada atendimento tem seu form completo
(título, tipo, categoria, prazo, dono). Permite criar 3 atendimentos
heterogêneos de uma vez.

## Pra depois (mais complexo, lote separado)

- **Modal do atendimento (ao clicar no card do kanban).** Alteração no
  `AtendimentoDetailModal`. A definir o escopo exato.
- **Passar a mensageria SDR Trips para o ttars.** É meu, mas mais pesado,
  vai num lote separado.
