const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function gerarCodigo(length = 6): string {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  let out = ''
  for (let i = 0; i < length; i++) out += CHARS[arr[i] % CHARS.length]
  return out
}

export function isValidCodigo(codigo: string): boolean {
  return /^[A-Z0-9-]{4,16}$/.test(codigo)
}
