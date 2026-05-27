// "48999999999" -> "48 99999-9999"
export function formatPhoneBR(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === 0) return ''
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  if (rest.length === 0) return ddd
  if (rest.length <= 4) return `${ddd} ${rest}`
  if (rest.length <= 8) return `${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`
  return `${ddd} ${rest.slice(0, 5)}-${rest.slice(5, 9)}`
}

export function phoneDigits(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '')
}

export function isValidPhoneBR(raw: string | null | undefined): boolean {
  return phoneDigits(raw).length >= 10
}
