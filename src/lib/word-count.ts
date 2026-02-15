export function countWords(text: string): number {
    const trimmed = text.trim()
    if (!trimmed) return 0
    return trimmed.split(/\s+/).length
}

/**
 * Extract plain text from Lexical JSON state and count words
 */
export function countWordsFromLexical(json: string | undefined): number {
    if (!json) return 0

    try {
        const state = JSON.parse(json)
        const text = extractTextFromLexicalNode(state.root)
        return countWords(text)
    } catch {
        return 0
    }
}

/**
 * Extract plain text from Lexical JSON (for validation)
 */
export function extractTextFromLexical(json: string | undefined): string {
    if (!json) return ''

    try {
        const state = JSON.parse(json)
        return extractTextFromLexicalNode(state.root)
    } catch {
        return ''
    }
}

function extractTextFromLexicalNode(node: unknown): string {
    if (!node || typeof node !== 'object') return ''

    const n = node as Record<string, unknown>

    if (n.type === 'text' && typeof n.text === 'string') {
        return n.text
    }

    if (Array.isArray(n.children)) {
        return n.children.map((child) => extractTextFromLexicalNode(child)).join(' ')
    }

    return ''
}
