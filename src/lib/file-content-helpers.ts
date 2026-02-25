type ContentType = 'csv' | 'text'

export function detectContentType(path: string): ContentType {
    if (path.toLowerCase().endsWith('.csv')) return 'csv'
    return 'text'
}

export function decodeFileContents(contents: ArrayBuffer): string {
    return new TextDecoder('utf-8').decode(contents)
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split('\n').filter((line) => line.trim().length > 0)
    if (lines.length === 0) return { headers: [], rows: [] }

    const headers = lines[0].split(',').map((h) => h.trim())
    const rows = lines.slice(1).map((line) => line.split(',').map((cell) => cell.trim()))

    return { headers, rows }
}
