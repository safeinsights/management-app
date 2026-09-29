'use client'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { lexicalTheme, lexicalNodes } from '@/components/editable-text/config'
import { LinkHoverCardReadOnlyPlugin } from '@/components/editable-text/link-hover-card-readonly-plugin'
import type { JsonValue } from '@/database/types'
import { isValidLexicalState } from '@/lib/lexical'
import logger from '@/lib/logger'

export function ReadOnlyLexicalContent({ value }: { value: string | JsonValue }) {
    if (value == null) return null
    const editorState = typeof value === 'string' ? value : JSON.stringify(value)

    // Lexical throws if initialized with an empty root, which legacy rows can hold.
    if (!isValidLexicalState(editorState)) return null

    const initialConfig = {
        namespace: 'ReadOnlyLexicalContent',
        theme: lexicalTheme,
        nodes: lexicalNodes,
        editable: false,
        editorState,
        onError: (error: Error) => {
            logger.error('Lexical read-only error:', error)
        },
    }

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <RichTextPlugin
                contentEditable={<ContentEditable style={{ outline: 'none' }} />}
                placeholder={null}
                ErrorBoundary={LexicalErrorBoundary}
            />
            {/* Owns link clicks: they open the card instead of a tab, and a modified or middle
                click still opens the destination. Nothing here unloads the app (OTTER-463). */}
            <LinkHoverCardReadOnlyPlugin />
        </LexicalComposer>
    )
}
