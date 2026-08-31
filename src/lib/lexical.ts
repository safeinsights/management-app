import { countCharacters } from '@/lib/field-limits'

/** A parsed Lexical document envelope. `root` stays `unknown`: only the walker below inspects it. */
type LexicalEnvelope = { root: unknown }

/**
 * The one place the app decides "is this value a Lexical document, or plain text?".
 *
 * That question used to be answered separately by {@link isValidLexicalState} and by an inline
 * check inside {@link normalizeFeedbackToLexical}, and the two had already drifted: given
 * `{"root":{"children":[]}}` the first said plain text and the second said Lexical, so an
 * empty-root state was wrapped on one path and passed through on the other. Two normalizers for one
 * concept is what a third caller would have inherited, so everything below now shares this one
 * (OTTER-737).
 */
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

/**
 * Any note or feedback value, whichever shape it arrived in, as plain text.
 *
 * The editor-backed fields post Lexical JSON and the older plain-text callers post a bare string.
 * Resolving that here is what lets the callers measure, test for emptiness and normalize without
 * re-deciding the shape each time.
 */
export function lexicalToText(value: string | undefined): string {
    if (!value) return ''

    const envelope = asLexicalEnvelope(value)
    return envelope ? extractTextFromLexicalNode(envelope.root) : value
}

/**
 * Extract plain text from Lexical JSON and count characters.
 *
 * Lexical only, like {@link extractTextFromLexical}: the editor-backed fields that call this have
 * no plain-text path, so a value that is not Lexical is bad input rather than prose and must not
 * measure as its own JSON. A field that accepts either shape counts
 * `countCharacters(lexicalToText(value))` instead.
 *
 * Counted through {@link countCharacters}, so surrounding whitespace is excluded and the counter
 * beside the field, the client rule and the server rule all measure the same thing. Callers pair
 * this with a trimmed emptiness check for the required rule (OTTER-690, OTTER-737).
 */
export function countCharactersFromLexical(json: string | undefined): number {
    return countCharacters(extractTextFromLexical(json))
}

/**
 * Extract plain text from Lexical JSON (for validation).
 *
 * Yields '' for a value that is not Lexical. Callers that also accept plain text want
 * {@link lexicalToText} instead.
 */
export function extractTextFromLexical(json: string | undefined): string {
    const envelope = asLexicalEnvelope(json)
    return envelope ? extractTextFromLexicalNode(envelope.root) : ''
}

/**
 * How a node's children are joined. Only block containers separate their children: a paragraph, a
 * format mark and a single list item all read as one run of text, so they join with nothing.
 *
 * `list` earns an entry because the editor offers bulleted and numbered lists, and a list is a
 * single root-level node. Without a separator its items concatenate, so a research question written
 * as a list read as "First question?Second question?" everywhere the plain text is shown or
 * measured (OTTER-755).
 */
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

/**
 * Check if any of the fields have non-empty Lexical content.
 *
 * Lexical only, deliberately. Every caller holds an editor value or a value already put through
 * {@link normalizeFeedbackToLexical}, and the four proposal rich-text fields rely on a non-Lexical
 * value reading as empty so that garbage fails their required rule rather than passing it as prose.
 * A field that accepts plain text as well tests `lexicalToText(value).trim()` instead.
 */
export function hasLexicalContent(...fields: (string | undefined)[]): boolean {
    return fields.some((field) => !!extractTextFromLexical(field).trim())
}

/**
 * Validates that a Lexical JSON string represents a non-empty editor state
 * (root node has at least one child). Lexical throws if initialized with an
 * empty root, so callers should fall back to a default state when this returns false.
 *
 * A narrower question than "is this Lexical?" and not a substitute for it: an empty-root document
 * is Lexical but is not a usable initial state. Use {@link lexicalToText} to read a value whose
 * shape is unknown.
 */
export function isValidLexicalState(json: string | undefined): boolean {
    const root = asLexicalEnvelope(json)?.root as { children?: unknown } | null | undefined
    return !!(root && Array.isArray(root.children) && root.children.length > 0)
}

/**
 * Accepts either a serialized Lexical state or raw text and returns Lexical JSON.
 * Editor-backed fields post Lexical JSON; plain-text callers (and tests) post a string.
 *
 * Normalizing only. It used to report a word count as well, which tied it to one unit; each
 * caller now measures the returned JSON in the unit its own field is capped in (OTTER-737).
 */
export function normalizeFeedbackToLexical(raw: string): string {
    // Non-Lexical JSON that reaches the pass-through yields no text, and so fails the caller's
    // required-field rule.
    return asLexicalEnvelope(raw) ? raw : lexicalJson(raw)
}

/** Wrap plain text in a minimal Lexical root state. */
export function lexicalJson(text: string): string {
    return JSON.stringify({
        root: {
            type: 'root',
            children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
        },
    })
}
