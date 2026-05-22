/**
 * Utilitários de data para o Public Proposal Viewer
 */

/**
 * Calcula número de noites entre duas datas
 */
export function calculateNights(checkIn: string | undefined, checkOut: string | undefined): number {
  if (!checkIn || !checkOut) return 0

  try {
    const start = new Date(checkIn)
    const end = new Date(checkOut)
    const diffTime = end.getTime() - start.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  } catch {
    return 0
  }
}

/**
 * Formata data para exibição (ex: "12 jan")
 */
export function formatDateShort(dateStr: string | undefined): string {
  if (!dateStr) return ''

  try {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short'
    }).replace('.', '')
  } catch {
    return dateStr || ''
  }
}

/**
 * Formata data para exibição longa (ex: "12 de janeiro de 2025")
 */
export function formatDateLong(dateStr: string | undefined): string {
  if (!dateStr) return ''

  try {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  } catch {
    return dateStr || ''
  }
}

/**
 * Formata data para exibição com dia da semana (ex: "sáb, 12 jan")
 */
export function formatDateWithWeekday(dateStr: string | undefined): string {
  if (!dateStr) return ''

  try {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).replace('.', '')
  } catch {
    return dateStr || ''
  }
}

/**
 * Formata range de datas (ex: "12 - 15 jan")
 */
export function formatDateRange(startDate: string | undefined, endDate: string | undefined): string {
  if (!startDate) return ''
  if (!endDate) return formatDateShort(startDate)

  try {
    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')

    const sameMonth = start.getMonth() === end.getMonth()
    const sameYear = start.getFullYear() === end.getFullYear()

    if (sameMonth && sameYear) {
      // "12 - 15 jan"
      return `${start.getDate()} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}`
    }

    // "12 jan - 15 fev"
    return `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`
  } catch {
    return `${startDate} - ${endDate}`
  }
}

/**
 * Formata hora para exibição (ex: "14:30").
 * Extrai HH:MM mesmo quando há lixo extra ("23:40 (+1)" → "23:40").
 * O sufixo "(+N)" é exibido separadamente por quem chama (badge "+1").
 */
export function formatTime(timeStr: string | undefined): string {
  if (!timeStr) return ''

  const match = String(timeStr).match(/(\d{1,2}):(\d{2})/)
  if (!match) return ''

  const h = match[1].padStart(2, '0')
  return `${h}:${match[2]}`
}

/**
 * Retorna apenas o sufixo "+N" (dia seguinte) se o horário tiver, ou '' senão.
 * Usado pra renderizar como badge discreto ao lado do horário de chegada.
 */
export function extractNextDayOffset(timeStr: string | undefined): string {
  if (!timeStr) return ''
  const m = String(timeStr).match(/\+(\d+)/)
  return m ? `+${m[1]}` : ''
}

/**
 * Calcula duração entre dois horários no mesmo dia ou dias diferentes
 */
export function calculateDuration(
  departureDate: string,
  departureTime: string,
  arrivalDate: string,
  arrivalTime: string
): string {
  if (!departureDate || !departureTime || !arrivalDate || !arrivalTime) return ''

  try {
    const dep = new Date(`${departureDate}T${departureTime}`)
    const arr = new Date(`${arrivalDate}T${arrivalTime}`)

    const diffMs = arr.getTime() - dep.getTime()
    if (diffMs < 0) return ''

    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (hours === 0) return `${mins}min`
    if (mins === 0) return `${hours}h`
    return `${hours}h${mins}min`
  } catch {
    return ''
  }
}

/**
 * Verifica se chegada é no dia seguinte
 */
export function isNextDay(departureDate: string, arrivalDate: string): boolean {
  if (!departureDate || !arrivalDate) return false
  return departureDate !== arrivalDate
}
