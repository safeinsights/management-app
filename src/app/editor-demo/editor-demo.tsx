'use client'

import { useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { Box, Container, Title, Text, Badge, Group, Paper } from '@mantine/core'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin'
import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { Doc } from 'yjs'
import type { Provider } from '@lexical/yjs'

import { lexicalTheme, lexicalNodes, isValidUrl } from '@/components/editable-text/config'
import { FloatingToolbar } from '@/components/editable-text/toolbar'

import './styles.css'

const COLORS = ['#e06c75', '#61afef', '#98c379', '#d19a66', '#c678dd', '#56b6c2', '#e5c07b']

function pickColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return COLORS[Math.abs(hash) % COLORS.length]
}

const initialConfig = {
    namespace: 'editor-demo',
    theme: lexicalTheme,
    nodes: lexicalNodes,
    editorState: null,
    onError: (error: Error) => console.error('Lexical error:', error),
}

function EditorContent({ username, cursorColor }: { username: string; cursorColor: string }) {
    const providerFactory = useCallback((id: string, yjsDocMap: Map<string, Doc>): Provider => {
        let doc = yjsDocMap.get(id)
        if (!doc) {
            doc = new Doc()
            yjsDocMap.set(id, doc)
        }

        const provider = new HocuspocusProvider({
            url: 'ws://localhost:1234',
            name: id,
            document: doc,
            autoConnect: false,
        } as ConstructorParameters<typeof HocuspocusProvider>[0])

        return provider as unknown as Provider
    }, [])

    return (
        <Paper shadow="sm" radius="md" p={0} style={{ overflow: 'hidden' }}>
            <RichTextPlugin
                contentEditable={<ContentEditable className="editor-demo-content" />}
                ErrorBoundary={LexicalErrorBoundary}
            />
            <CollaborationPlugin
                id="editor-demo"
                providerFactory={providerFactory}
                shouldBootstrap={true}
                username={username}
                cursorColor={cursorColor}
            />
            <ListPlugin />
            <LinkPlugin validateUrl={isValidUrl} />
            <FloatingToolbar />
        </Paper>
    )
}

export default function EditorDemo() {
    const { user } = useUser()

    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Anonymous'
    const color = pickColor(name)

    return (
        <Container size="lg" py="xl">
            <Box mb="lg">
                <Title order={2}>Collaborative Editor Demo</Title>
                <Text c="dimmed" size="sm" mt="xs">
                    Open this page in multiple browser windows to see real-time collaboration.
                </Text>
                <Group mt="xs" gap="xs">
                    <Badge color={color} variant="filled" size="sm">
                        {name}
                    </Badge>
                    <Text size="xs" c="dimmed">
                        Connected to ws://localhost:1234
                    </Text>
                </Group>
            </Box>

            <LexicalComposer initialConfig={initialConfig}>
                <LexicalCollaboration>
                    <EditorContent username={name} cursorColor={color} />
                </LexicalCollaboration>
            </LexicalComposer>
        </Container>
    )
}
