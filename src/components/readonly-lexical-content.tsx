'use client'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin'
import { lexicalTheme, lexicalNodes } from '@/components/editable-text/config'
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
            {/* newTab forces _blank even for links stored before target was set,
                and preventing the default click keeps us from unloading the app. */}
            <ClickableLinkPlugin newTab />
        </LexicalComposer>
    )
}
