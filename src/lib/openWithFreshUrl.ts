/**
 * Abre um arquivo do Storage em nova aba usando uma URL assinada gerada na hora,
 * evitando o erro "InvalidJWT / exp claim timestamp check failed" de links vencidos.
 *
 * Abre a aba em branco de forma síncrona (dentro do gesto do usuário) para não cair
 * no bloqueador de pop-up, e só então navega para a URL fresca quando ela chega.
 */
export async function openWithFreshUrl(
  path: string,
  getSignedUrl: (path: string) => Promise<string | null>,
): Promise<void> {
  // Sem 'noopener' aqui: a flag faria window.open retornar null e perderíamos o handle.
  const win = window.open('about:blank', '_blank')
  const url = await getSignedUrl(path)
  if (!url) {
    win?.close()
    return
  }
  if (win) {
    win.opener = null // corta o vínculo (anti-tabnabbing) já que abrimos sem noopener
    win.location.href = url
  } else {
    // pop-up bloqueado — tenta abrir direto
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
