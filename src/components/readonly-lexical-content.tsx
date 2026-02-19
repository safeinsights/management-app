'use client'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import logger from '@/lib/logger'

const theme = {
    text: {
        bold: 'editable-text-bold',
        italic: 'editable-text-italic',
        underline: 'editable-text-underline',
    },
}

export function ReadOnlyLexicalContent({ value }: { value: string }) {
    const initialConfig = {
        namespace: 'ReadOnlyLexicalContent',
        theme,
        editable: false,
        editorState: value,
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
        </LexicalComposer>
    )
}
