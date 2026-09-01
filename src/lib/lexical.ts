import { countCharacters } from '@/lib/field-limits'

type LexicalEnvelope = { root: unknown }

// The one place the app decides "Lexical document or plain text?", so an empty-root state cannot
// be classified one way on one path and another elsewhere (OTTER-737).
function asLexicalEnvelope(value: string | undefined): LexicalEnvelope | null {
    if (!value) return null

    try {
        const parsed: unknown = JSON.parse(value)
        if (!parsed || typeof parsed !== 'object' || !('root' in parsed)) return null

        const { root } = parsed as LexicalEnvelope
        return typeof root === 'object' ? { root } : null
    } catch {
        return null
    }
}

// Accepts either Lexical JSON or a bare string from older plain-text callers.
export function lexicalToText(value: string | undefined): string {
    if (!value) return ''

    const envelope = asLexicalEnvelope(value)
    return envelope ? extractTextFromLexicalNode(envelope.root) : value
}

// Lexical only: a non-Lexical value must not measure as its own JSON. A field accepting either
// shape counts `countCharacters(lexicalToText(value))` instead.
export function countCharactersFromLexical(json: string | undefined): number {
    return countCharacters(extractTextFromLexical(json))
}

// Yields '' for a value that is not Lexical; callers that also accept plain text want
// {@link lexicalToText}.
export function extractTextFromLexical(json: string | undefined): string {
    const envelope = asLexicalEnvelope(json)
    return envelope ? extractTextFromLexicalNode(envelope.root) : ''
}

// A list is one root-level node, so without a separator its items concatenate into
// "First question?Second question?" (OTTER-755).
const CHILD_SEPARATORS: Record<string, string> = {
    root: '\n\n',
    list: '\n',
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
        const separator = typeof n.type === 'string' ? (CHILD_SEPARATORS[n.type] ?? '') : ''
        return n.children.map((child) => extractTextFromLexicalNode(child)).join(separator)
    }

    return ''
}

// Lexical only: the proposal rich-text fields rely on a non-Lexical value reading as empty so
// garbage fails their required rule rather than passing as prose.
export function hasLexicalContent(...fields: (string | undefined)[]): boolean {
    return fields.some((field) => !!extractTextFromLexical(field).trim())
}

// Lexical throws if initialized with an empty root, so callers fall back to a default state
// when this is false.
export function isValidLexicalState(json: string | undefined): boolean {
    const root = asLexicalEnvelope(json)?.root as { children?: unknown } | null | undefined
    return !!(root && Array.isArray(root.children) && root.children.length > 0)
}

export function normalizeFeedbackToLexical(raw: string): string {
    return asLexicalEnvelope(raw) ? raw : lexicalJson(raw)
}

export function lexicalJson(text: string): string {
    return JSON.stringify({
        root: {
            type: 'root',
            children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
        },
    })
}
