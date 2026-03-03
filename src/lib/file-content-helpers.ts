import Papa from 'papaparse'

export function decodeFileContents(contents: ArrayBuffer): string {
    return new TextDecoder('utf-8').decode(contents)
}

export type LogEntry = { timestamp: number; message: string }

export function parseLogMessages(text: string): LogEntry[] | null {
    const trimmed = text.trim()
    if (!trimmed.startsWith('[')) return null

    try {
        const parsed: unknown = JSON.parse(trimmed)
        if (!Array.isArray(parsed) || parsed.length === 0) return null

        const entries: LogEntry[] = []
        for (const item of parsed) {
            if (typeof item !== 'object' || item === null) return null
            if (typeof item.timestamp !== 'number' || typeof item.message !== 'string') return null
            entries.push({ timestamp: item.timestamp, message: item.message })
        }
        return entries
    } catch {
        return null
    }
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
    const result = Papa.parse<string[]>(text, {
        header: false,
        skipEmptyLines: true,
        transform: (value) => value.trim(),
    })

    if (result.data.length === 0) return { headers: [], rows: [] }

    const [headers, ...rows] = result.data
    return { headers, rows }
}
