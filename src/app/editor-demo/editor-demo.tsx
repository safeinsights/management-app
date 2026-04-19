'use client'

import { useUser } from '@clerk/nextjs'
import { Box, Container, Title, Text, Badge, Group } from '@mantine/core'

import { CollaborativeEditor } from '@/components/editable-text/collaborative-editor'
import { pickCursorColor } from '@/components/editable-text/config'

import './styles.css'

export default function EditorDemo({ wsUrl }: { wsUrl: string }) {
    const { user } = useUser()

    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Anonymous'
    const color = pickCursorColor(name)

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
                </Group>
            </Box>

            <CollaborativeEditor
                id="editor-demo"
                wsUrl={wsUrl}
                contentClassName="editor-demo-content"
                containerProps={{ shadow: 'sm', radius: 'md' }}
            />
        </Container>
    )
}
