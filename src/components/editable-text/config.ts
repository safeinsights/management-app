import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import type { Klass, LexicalNode } from 'lexical'

export function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.')
    } catch {
        return false
    }
}

export const lexicalTheme = {
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

const CURSOR_COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b']

export function pickCursorColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}
