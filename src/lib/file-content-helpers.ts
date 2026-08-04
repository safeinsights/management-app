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
            // Exactly these two keys. Since this viewer is chosen by sniffing content rather than by
            // file identity, a result file that happens to be log-shaped would otherwise render as a
            // timestamp/message table with its other fields silently dropped, in a view whose whole
            // purpose is deciding what is safe to disclose.
            if (Object.keys(item).length !== 2) return null
            entries.push({ timestamp: item.timestamp, message: item.message })
        }
        return entries
    } catch {
        return null
    }
}

// Results are frequently written as minified JSON, which renders as one enormous line. Re-indent it
// for display. Returns null when the text isn't valid JSON, so callers fall back to the raw text
// rather than showing nothing.
//
// The round trip through JSON.parse is lossy for numbers: integers past Number.MAX_SAFE_INTEGER and
// high-precision floats get rounded, and 1.50/1e5 re-serialize as 1.5/100000. This is the surface a
// reviewer uses to judge whether output is safe to disclose, so a number that disagrees with the
// file is worse than an ugly one. Re-serialize and compare against the minified input; on any
// disagreement return null and let the caller show the bytes as they are.
export function formatJson(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

    try {
        const parsed: unknown = JSON.parse(trimmed)
        if (JSON.stringify(parsed) !== minifyJson(trimmed)) return null
        return JSON.stringify(parsed, null, 2)
    } catch {
        return null
    }
}

// Strip insignificant whitespace so the fidelity check compares values rather than formatting.
// String contents are preserved verbatim, since whitespace inside them is significant.
function minifyJson(json: string): string {
    let out = ''
    let inString = false
    let escaped = false

    for (const char of json) {
        if (inString) {
            out += char
            if (escaped) escaped = false
            else if (char === '\\') escaped = true
            else if (char === '"') inString = false
            continue
        }
        if (char === '"') {
            inString = true
            out += char
            continue
        }
        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') continue
        out += char
    }

    return out
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
