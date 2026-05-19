/** Mockup determinístico de capacidade de hotel por casamento.
 *  Cada cardId gera o mesmo par (total, disponíveis) entre cards e detalhe.
 *  Quando o sistema real de reservas de hotelaria existir, substituir por
 *  consulta de banco. */
export interface HotelRooms {
  total: number
  disponiveis: number
  reservados: number
  ocupacao: number
}

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function mockHotelRooms(cardId: string): HotelRooms {
  const h = hash(cardId)
  const total = 40 + (h % 30)              // 40..69
  const reservados = h % total              // 0..total-1
  const disponiveis = total - reservados
  const ocupacao = Math.round((reservados / total) * 100)
  return { total, disponiveis, reservados, ocupacao }
}
