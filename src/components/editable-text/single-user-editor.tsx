'use client'

import { useEffect } from 'react'
import { Box, Group, Paper, Stack, Text } from '@mantine/core'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { EditorState } from 'lexical'

import { isValidLexicalState } from '@/lib/lexical'
import logger from '@/lib/logger'
import { lexicalTheme, lexicalNodes, isValidUrl } from './config'
import { Toolbar } from './toolbar'
import { EscapeFocusPlugin } from './escape-focus-plugin'

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
    footerRight?: React.ReactNode
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
    footerRight,
    children,
}: SingleUserEditorProps) {
    return (
        <LexicalComposer initialConfig={createInitialConfig(id, initialValue)}>
            <Paper
                p={0}
                className="collaborative-editor-container"
                style={{ overflow: 'hidden', position: 'relative' }}
            >
                <RichTextPlugin
                    contentEditable={
                        <ContentEditable className={contentClassName} style={contentStyle} ariaLabel={ariaLabel} />
                    }
                    placeholder={
                        placeholder ? (
                            <Text
                                c="dimmed"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    padding: contentStyle?.padding,
                                    fontSize: contentStyle?.fontSize,
                                    lineHeight: contentStyle?.lineHeight,
                                    pointerEvents: 'none',
                                }}
                            >
                                {placeholder}
                            </Text>
                        ) : null
                    }
                    ErrorBoundary={LexicalErrorBoundary}
                />
                <HistoryPlugin />
                <ListPlugin />
                <TabIndentationPlugin />
                <EscapeFocusPlugin />
                <LinkPlugin validateUrl={isValidUrl} />
                {onChange && <EditorChangePlugin onChange={onChange} />}
                {children}
                <Toolbar />
            </Paper>
            {footerRight && (
                <Stack gap={4} mt={4}>
                    <Group align="center" wrap="nowrap">
                        <Box ml="auto">{footerRight}</Box>
                    </Group>
                </Stack>
            )}
        </LexicalComposer>
    )
}
