/** Parse Brazilian number formats: "R$ 64.918,00", "64.918,00", "5.747,44", "64918", etc. */
export function parseBRNumber(value: unknown): number {
    if (value === null || value === undefined) return 0
    if (typeof value === 'number') return isNaN(value) ? 0 : value

    let str = String(value).trim()
    // Remove currency symbol and whitespace
    str = str.replace(/^R\$\s*/i, '').trim()
    if (!str) return 0

    const hasComma = str.includes(',')
    const hasDot = str.includes('.')

    if (hasComma && hasDot) {
        // Both: determine order to detect format
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            // Comma after dot → BR: "64.918,00" → remove dots, comma→dot
            str = str.replace(/\./g, '').replace(',', '.')
        } else {
            // Dot after comma → US: "64,918.00" → remove commas
            str = str.replace(/,/g, '')
        }
    } else if (hasComma) {
        // Only comma → BR decimal: "5747,44" → comma→dot
        str = str.replace(',', '.')
    }
    // Only dot or no separator → already valid for Number()

    const num = Number(str)
    return isNaN(num) ? 0 : num
}
