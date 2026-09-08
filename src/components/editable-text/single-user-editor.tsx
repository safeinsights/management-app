'use client'

import { useEffect } from 'react'
import { Stack } from '@mantine/core'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { EditorState } from 'lexical'

import { isValidLexicalState } from '@/lib/lexical'
import logger from '@/lib/logger'
import { lexicalTheme, lexicalNodes, isValidUrl, linkAttributes } from './config'
import { EditorFooter } from './editor-footer'
import { EditorSurface } from './editor-surface'
import { EscapeFocusPlugin } from './escape-focus-plugin'
import { useWidgetBlur } from '@/components/form-field'

// Mirrors CollaborativeEditor's prop surface so callers swap transparently.
export type SingleUserEditorProps = {
    id: string
    /** Serialized Lexical JSON to seed the editor with. */
    initialValue?: string
    contentClassName?: string
    contentStyle?: React.CSSProperties
    placeholder?: string
    ariaLabel?: string
    onChange?: (json: string) => void
    footerLeft?: React.ReactNode
    footerRight?: React.ReactNode
    /** DOM id of the focusable surface. Distinct from `id`, which names the Yjs document. */
    inputId?: string
    /** `string` not `ReactNode`, so a falsy node cannot read as "no error". */
    error?: string | null
    ariaDescribedBy?: string
    ariaRequired?: boolean
    /** Fires only when focus leaves the whole editor, toolbar included. */
    onBlur?: () => void
    contentHeight?: number
    isResizable?: boolean
    children?: React.ReactNode
}

function createInitialConfig(id: string, initialValue: string | undefined) {
    // Lexical throws if initialized with the empty-root JSON that legacy rows hold.
    const editorState = isValidLexicalState(initialValue) ? initialValue : undefined
    return {
        namespace: `single-user-editor-${id}`,
        theme: lexicalTheme,
        nodes: lexicalNodes,
        editorState,
        onError: (error: Error) => logger.error('Lexical error:', error),
    }
}

function EditorChangePlugin({ onChange }: { onChange: (json: string) => void }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }: { editorState: EditorState }) => {
            const json = editorState.toJSON()
            // Never persist an empty root, which Lexical rejects on re-hydration.
            if (!json.root?.children?.length) return
            onChange(JSON.stringify(json))
        })
    }, [editor, onChange])

    return null
}

export function SingleUserEditor({
    id,
    initialValue,
    contentClassName,
    contentStyle,
    placeholder,
    ariaLabel,
    onChange,
    footerLeft,
    footerRight,
    inputId,
    error,
    ariaDescribedBy,
    ariaRequired,
    onBlur,
    contentHeight,
    isResizable,
    children,
}: SingleUserEditorProps) {
    const widgetBlur = useWidgetBlur<HTMLDivElement>(onBlur)

    return (
        <LexicalComposer initialConfig={createInitialConfig(id, initialValue)}>
            <EditorSurface
                inputId={inputId}
                contentClassName={contentClassName}
                contentStyle={contentStyle}
                placeholder={placeholder}
                ariaLabel={ariaLabel}
                ariaDescribedBy={ariaDescribedBy}
                ariaRequired={ariaRequired}
                error={error}
                widgetBlur={widgetBlur}
                contentHeight={contentHeight}
                isResizable={isResizable}
            >
                <HistoryPlugin />
                <ListPlugin />
                {/* No TabIndentationPlugin: banned in eslint.config.mjs, which carries the why. */}
                <EscapeFocusPlugin />
                <LinkPlugin validateUrl={isValidUrl} attributes={linkAttributes} />
                {onChange && <EditorChangePlugin onChange={onChange} />}
                {children}
            </EditorSurface>
            {(footerLeft || footerRight) && (
                <Stack gap={4} mt={4}>
                    <EditorFooter left={footerLeft} right={footerRight} />
                </Stack>
            )}
        </LexicalComposer>
    )
}
