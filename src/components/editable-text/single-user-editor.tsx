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

/**
 * Non-collaborative editor used when NEXT_PUBLIC_SINGLE_USER_EDITING is set.
 * Accepts the same prop surface as CollaborativeEditor (collaboration-only props
 * are accepted and ignored) so callers can swap between the two transparently.
 * Content is seeded from `initialValue` and persisted through the parent's
 * `onChange` to the existing Lexical JSON columns — no Yjs, no websocket.
 */
export type SingleUserEditorProps = {
    id: string
    /** Serialized Lexical JSON to seed the editor with. */
    initialValue?: string
    contentClassName?: string
    contentStyle?: React.CSSProperties
    placeholder?: string
    ariaLabel?: string
    onChange?: (json: string) => void
    /** See EditorProps.footerLeft. */
    footerLeft?: React.ReactNode
    footerRight?: React.ReactNode
    /** DOM id for the focusable editor surface. Distinct from `id`, which names the Yjs document. */
    inputId?: string
    /**
     * Presence drives the red border, `aria-invalid`, and hiding the save indicator; the message
     * itself is rendered by the caller. Typed `string`, not `ReactNode`, so presence stays a plain
     * truthiness check — a falsy-but-present node (`0`, `''`) can't read as "no error".
     */
    error?: string | null
    /** Id(s) of the description/error nodes describing this editor. */
    ariaDescribedBy?: string
    /** Marks the editor required to assistive tech; the label asterisk is visual only. */
    ariaRequired?: boolean
    /** Fires only when focus leaves the whole editor, toolbar included. */
    onBlur?: () => void
    /** Height of the editable area before any typing or dragging. */
    contentHeight?: number
    /** False once the field is read-only, which removes the resize handle. */
    isResizable?: boolean
    /** Extra plugins/children rendered inside the Lexical composer context. */
    children?: React.ReactNode
}

function createInitialConfig(id: string, initialValue: string | undefined) {
    // Lexical throws if initialized with empty-root JSON (legacy rows predate the
    // EditorChangePlugin save-boundary filter), so fall back to its default state.
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
            // Mirror the collaborative editor: never persist an empty root, which
            // Lexical rejects on re-hydration and would crash the read-only views.
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
