import Papa from 'papaparse'

export function decodeFileContents(contents: ArrayBuffer): string {
    return new TextDecoder('utf-8').decode(contents)
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
