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
 * Extract plain text from Lexical JSON state and count characters.
 *
 * Counted RAW, not trimmed, unlike {@link countWordsFromLexical}. The counter shown beside the
 * field and the validator that gates it must agree, and the counter counts what the user typed:
 * trimming here would let a field read 3000/3000 while the validator saw 3001 (OTTER-690 applied
 * the same rule to the Step 1 title).
 */
export function countCharactersFromLexical(json: string | undefined): number {
    return extractTextFromLexical(json).length
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

    if (n.type === 'linebreak') {
        return '\n'
    }

    if (Array.isArray(n.children)) {
        const texts = n.children.map((child) => extractTextFromLexicalNode(child))
        return n.type === 'root' ? texts.join('\n\n') : texts.join('')
    }

    return ''
}

/**
 * Check if any of the fields have non-empty lexical content
 */
export function hasLexicalContent(...fields: (string | undefined)[]): boolean {
    return fields.some((field) => !!extractTextFromLexical(field).trim())
}

/**
 * Validates that a Lexical JSON string represents a non-empty editor state
 * (root node has at least one child). Lexical throws if initialized with an
 * empty root, so callers should fall back to a default state when this returns false.
 */
export function isValidLexicalState(json: string | undefined): boolean {
    if (!json) return false
    try {
        const state = JSON.parse(json)
        const root = state?.root
        return !!(root && Array.isArray(root.children) && root.children.length > 0)
    } catch {
        return false
    }
}

/**
 * Accepts either a serialized Lexical state or raw text and returns Lexical JSON.
 * Editor-backed fields post Lexical JSON; plain-text callers (and tests) post a string.
 *
 * Normalizing only. It used to report a word count as well, which tied it to one unit; each
 * caller now measures the returned JSON in the unit its own field is capped in (OTTER-737).
 */
export function normalizeFeedbackToLexical(raw: string): string {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        parsed = null
    }

    // Loose check: non-Lexical JSON that passes yields no text, and so fails the caller's
    // required-field rule.
    const looksLikeLexicalRoot =
        parsed != null &&
        typeof parsed === 'object' &&
        'root' in (parsed as Record<string, unknown>) &&
        typeof (parsed as { root: unknown }).root === 'object'

    return looksLikeLexicalRoot ? raw : lexicalJson(raw)
}

/**
 * Create Lexical JSON from plain text (for testing)
 */

export function lexicalJson(text: string): string {
    return JSON.stringify({
        root: {
            type: 'root',
            children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
        },
    })
}
