import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import type { LinkAttributes } from '@lexical/link'
import type { Klass, LexicalNode } from 'lexical'

export function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.')
    } catch {
        return false
    }
}

// Stable identity: LinkPlugin lists `attributes` in its effect deps, so an inline literal would
// re-register TOGGLE_LINK_COMMAND on every render.
export const linkAttributes: LinkAttributes = { target: '_blank', rel: 'noopener noreferrer' }

export const lexicalTheme = {
    // Lexical paragraphs would otherwise inherit the UA default margin-block: 1em,
    // which reads as a blank line between paragraphs.
    paragraph: 'editable-text-paragraph',
    text: {
        bold: 'editable-text-bold',
        italic: 'editable-text-italic',
        underline: 'editable-text-underline',
    },
    list: {
        ul: 'editable-text-ul',
        ol: 'editable-text-ol',
        listitem: 'editable-text-listitem',
        nested: {
            listitem: 'editable-text-nested-listitem',
        },
    },
    link: 'editable-text-link',
}

export const lexicalNodes: Klass<LexicalNode>[] = [ListNode, ListItemNode, LinkNode]

// A per-user identity palette, not a design role, so it reads SI ramps directly. Each shade holds
// 4.5:1 under the white 12px name label Lexical draws on the cursor.
const CURSOR_COLORS = [
    'var(--mantine-color-red-6)',
    'var(--mantine-color-blue-6)',
    'var(--mantine-color-green-6)',
    'var(--mantine-color-yellow-7)',
    'var(--mantine-color-purple-5)',
    'var(--mantine-color-turquoise-7)',
    'var(--mantine-color-grey-6)',
]

export function pickCursorColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}
