import { phoneDigits } from './formatPhoneBR'

export function buildLinkCasal(codigo: string, origin?: string): string {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/lista-convidados/${encodeURIComponent(codigo)}`
}

export function buildWhatsappLink(
  whatsappDigits: string,
  codigo: string,
  origin?: string,
): string | null {
  const digits = phoneDigits(whatsappDigits)
  if (digits.length < 10) return null
  const full = digits.startsWith('55') ? digits : `55${digits}`
  const link = buildLinkCasal(codigo, origin)
  const msg = encodeURIComponent(
    `Olá! Aqui está o link para vocês preencherem a lista de convidados do casamento: ${link}\n\nQualquer dúvida estamos por aqui.\nEquipe Welcome Weddings.`,
  )
  return `https://wa.me/${full}?text=${msg}`
}
