import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode } from '@lexical/link'
import type { Klass, LexicalNode } from 'lexical'

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
