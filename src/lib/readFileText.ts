/**
 * Lê arquivo de texto com detecção automática de encoding.
 *
 * CSVs exportados do Monde/Excel BR usam Latin-1 (Windows-1252), não UTF-8.
 * `file.text()` assume UTF-8 e corrompe acentos (á → �).
 *
 * Esta função lê como ArrayBuffer, tenta UTF-8, e faz fallback para
 * Windows-1252 se detectar caracteres corrompidos (U+FFFD).
 *
 * USAR SEMPRE que ler arquivo de texto uploadado pelo usuário.
 * NUNCA usar `file.text()` diretamente.
 */
export async function readFileText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    if (utf8.includes('\uFFFD')) {
        return new TextDecoder('windows-1252').decode(buffer)
    }
    return utf8
}
