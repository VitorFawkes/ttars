/**
 * Utilitários de preço para o Public Proposal Viewer
 */

export type Currency = 'BRL' | 'USD' | 'EUR'

/**
 * Símbolos de moeda
 */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  BRL: 'R$',
  USD: 'US$',
  EUR: '€',
}

/**
 * Taxas de conversão aproximadas (base USD)
 * TODO: Integrar com API de câmbio real
 */
export const CURRENCY_RATES: Record<Currency, number> = {
  USD: 1,
  BRL: 5.0,
  EUR: 0.92,
}

/**
 * Formata preço para exibição
 */
export function formatPrice(
  value: number | string | undefined | null,
  currency: Currency = 'BRL'
): string {
  const numValue = Number(value) || 0

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numValue)
}

/**
 * Formata preço com símbolo customizado
 */
export function formatPriceWithSymbol(
  value: number | string | undefined | null,
  currency: Currency = 'BRL'
): string {
  const numValue = Number(value) || 0
  const symbol = CURRENCY_SYMBOLS[currency] || 'R$'

  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numValue)

  return `${symbol} ${formatted}`
}

/**
 * Formata preço compacto (ex: "8,5k" para 8500)
 */
export function formatPriceCompact(
  value: number | string | undefined | null,
  currency: Currency = 'BRL'
): string {
  const numValue = Number(value) || 0
  const symbol = CURRENCY_SYMBOLS[currency] || 'R$'

  if (numValue >= 1000000) {
    return `${symbol} ${(numValue / 1000000).toFixed(1)}M`
  }
  if (numValue >= 1000) {
    return `${symbol} ${(numValue / 1000).toFixed(1)}k`
  }
  return formatPriceWithSymbol(numValue, currency)
}

/**
 * Converte preço entre moedas
 */
export function convertCurrency(
  value: number,
  from: Currency,
  to: Currency
): number {
  if (from === to) return value

  // Converte para USD primeiro, depois para moeda destino
  const valueInUSD = value / CURRENCY_RATES[from]
  return valueInUSD * CURRENCY_RATES[to]
}

/**
 * Formata delta de preço (ex: "+R$ 500" ou "-R$ 200")
 */
export function formatPriceDelta(
  value: number | string | undefined | null,
  currency: Currency = 'BRL'
): string {
  const numValue = Number(value) || 0
  const symbol = CURRENCY_SYMBOLS[currency] || 'R$'

  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(numValue))

  if (numValue > 0) return `+${symbol} ${formatted}`
  if (numValue < 0) return `-${symbol} ${formatted}`
  return `${symbol} ${formatted}`
}

/**
 * Calcula total com opções selecionadas
 */
export function calculateTotalWithOptions(
  basePrice: number,
  selectedOptionDelta: number = 0,
  quantity: number = 1
): number {
  return (basePrice + selectedOptionDelta) * quantity
}
