/** Helpers de ritmo do disparo, compartilhados entre o modal de criação e o
 *  painel de controle (pra estimativa do cliente não divergir do servidor). */

/** Minutos reais entre levas, a partir do valor + unidade escolhidos. */
export function intervaloEmMin(valor: number, unidade: 'min' | 'h'): number {
  return unidade === 'h' ? valor * 60 : valor
}

/** Quantas mensagens por dia o ritmo "tamanhoLeva a cada intervaloMin" produz,
 *  na janela 08–20h (720 min). ~30s por mensagem dentro da leva. Espelha a
 *  lógica de disparo_calcular_agenda no servidor. */
export function derivarPorDia(tamanhoLeva: number, intervaloMin: number): number {
  const cycle = Math.max(intervaloMin + tamanhoLeva * 0.5, 1)
  const levasDia = Math.max(1, Math.floor(720 / cycle))
  return Math.max(levasDia * tamanhoLeva, tamanhoLeva)
}
