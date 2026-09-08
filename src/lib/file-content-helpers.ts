import Papa from 'papaparse'

export function decodeFileContents(contents: ArrayBuffer): string {
    return new TextDecoder('utf-8').decode(contents)
}

const IMAGE_MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
}

export function imageMimeType(path: string): string | null {
    const dotIndex = path.lastIndexOf('.')
    if (dotIndex < 0) return null
    const ext = path.slice(dotIndex).toLowerCase()
    return IMAGE_MIME_TYPES[ext] ?? null
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
            // This viewer is chosen by sniffing content, so a log-shaped result file would
            // otherwise render with its other fields silently dropped.
            if (Object.keys(item).length !== 2) return null
            entries.push({ timestamp: item.timestamp, message: item.message })
        }
        return entries
    } catch {
        return null
    }
}

export function formatJson(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
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
