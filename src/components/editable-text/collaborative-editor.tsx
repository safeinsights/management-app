'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Badge, Group, Paper, Text } from '@mantine/core'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Doc } from 'yjs'
import type { Provider } from '@lexical/yjs'

import { lexicalTheme, lexicalNodes, isValidUrl, pickCursorColor } from './config'
import { Toolbar } from './toolbar'
import { EscapeFocusPlugin } from './escape-focus-plugin'

type ActiveEditor = { name: string; color: string; focusing: boolean }

function useActiveEditors(providerRef: React.RefObject<HocuspocusProvider | null>) {
    const [editors, setEditors] = useState<ActiveEditor[]>([])

    useEffect(() => {
        const provider = providerRef.current
        if (!provider) return

        const awareness = provider.awareness!

        const update = () => {
            const states: ActiveEditor[] = []
            awareness.getStates().forEach((state, clientId) => {
                if (clientId !== awareness.clientID && state.name) {
                    states.push({ name: state.name, color: state.color, focusing: state.focusing })
                }
            })
            setEditors(states)
        }

        awareness.on('change', update)
        update()

        return () => {
            awareness.off('change', update)
        }
    }, [providerRef])

    return editors
}

function ActiveEditorsList({ providerRef }: { providerRef: React.RefObject<HocuspocusProvider | null> }) {
    const editors = useActiveEditors(providerRef)

    if (editors.length === 0) return null

    return (
        <Group mt="xs" gap="xs">
            <Text size="xs" c="dimmed">
                Also editing:
            </Text>
            {editors.map((editor) => (
                <Badge key={editor.name} color={editor.color} variant="light" size="sm">
                    {editor.name}
                </Badge>
            ))}
        </Group>
    )
}

function EditorChangePlugin({ onChange }: { onChange: (json: string) => void }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            onChange(JSON.stringify(editorState.toJSON()))
        })
    }, [editor, onChange])

    return null
}

function useCollaborationProvider(wsUrl: string, providerRef: React.MutableRefObject<HocuspocusProvider | null>) {
    return useCallback(
        (id: string, yjsDocMap: Map<string, Doc>): Provider => {
            let doc = yjsDocMap.get(id)
            if (!doc) {
                doc = new Doc()
                yjsDocMap.set(id, doc)
            }

            const provider = new HocuspocusProvider({
                url: wsUrl,
                name: id,
                document: doc,
                autoConnect: false,
            } as ConstructorParameters<typeof HocuspocusProvider>[0])

            providerRef.current = provider

            return provider as unknown as Provider
        },
        [wsUrl, providerRef],
    )
}

const initialConfig = {
    namespace: 'collaborative-editor',
    theme: lexicalTheme,
    nodes: lexicalNodes,
    editorState: null,
    onError: (error: Error) => console.error('Lexical error:', error),
}

export type CollaborativeEditorProps = {
    id: string
    wsUrl: string
    contentClassName?: string
    contentStyle?: React.CSSProperties
    placeholder?: string
    onChange?: (json: string) => void
}

export function CollaborativeEditor({
    id,
    wsUrl,
    contentClassName,
    contentStyle,
    placeholder,
    onChange,
}: CollaborativeEditorProps) {
    const { user } = useUser()
    const providerRef = useRef<HocuspocusProvider | null>(null)
    const username = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Anonymous'
    const cursorColor = pickCursorColor(username)
    const providerFactory = useCollaborationProvider(wsUrl, providerRef)

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <LexicalCollaboration>
                <Paper
                    p={0}
                    className="collaborative-editor-container"
                    style={{ overflow: 'hidden', position: 'relative' }}
                >
                    <RichTextPlugin
                        contentEditable={<ContentEditable className={contentClassName} style={contentStyle} />}
                        placeholder={
                            placeholder ? (
                                <Text
                                    c="dimmed"
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        padding: contentStyle?.padding,
                                        pointerEvents: 'none',
                                    }}
                                >
                                    {placeholder}
                                </Text>
                            ) : null
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <CollaborationPlugin
                        id={id}
                        providerFactory={providerFactory}
                        shouldBootstrap={false}
                        username={username}
                        cursorColor={cursorColor}
                    />
                    {onChange && <EditorChangePlugin onChange={onChange} />}
                    <ListPlugin />
                    <TabIndentationPlugin />
                    <EscapeFocusPlugin />
                    <LinkPlugin validateUrl={isValidUrl} />
                    <Toolbar />
                </Paper>
                <ActiveEditorsList providerRef={providerRef} />
            </LexicalCollaboration>
        </LexicalComposer>
    )
}
