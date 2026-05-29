'use client'

import { Container, Group, Loader, Stack, Text, Title, Anchor, Button } from '@mantine/core'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { startIdeSessionAction } from '@/server/actions/workspaces.actions'

const MAX_RETRIES = 6

export default function LaunchPage() {
    const { studyId } = useParams<{ studyId: string }>()
    const router = useRouter()
    const [message, setMessage] = useState('Spinning up your IDE…')
    const [error, setError] = useState<string | null>(null)
    const cancelledRef = useRef(false)

    useEffect(() => {
        cancelledRef.current = false

        const attempt = async (n: number): Promise<void> => {
            if (cancelledRef.current) return

            const res = await startIdeSessionAction({ studyId })
            if (cancelledRef.current) return

            if ('error' in res) {
                // Could be a 503/retry response or a generic ActionError
                const retryAfter = 'retryAfter' in res && typeof res.retryAfter === 'number' ? res.retryAfter : null
                if (retryAfter !== null && n < MAX_RETRIES) {
                    setMessage(`Spinning up your IDE… (waiting for capacity, attempt ${n + 1}/${MAX_RETRIES})`)
                    window.setTimeout(() => {
                        void attempt(n + 1)
                    }, retryAfter * 1000)
                    return
                }
                const errorMsg = typeof res.error === 'string' ? res.error : 'Failed to start IDE. Please try again.'
                setError(errorMsg)
                return
            }

            if ('sessionUrl' in res && res.sessionUrl) {
                window.location.replace(res.sessionUrl)
            }
        }

        void attempt(0)
        return () => {
            cancelledRef.current = true
        }
    }, [studyId])

    if (error) {
        return (
            <Container size="sm" pt="xl">
                <Stack gap="md" align="center">
                    <Title order={3}>Could not start your IDE</Title>
                    <Text c="dimmed" ta="center">
                        {error}
                    </Text>
                    <Group>
                        <Button onClick={() => router.refresh()}>Try again</Button>
                        <Anchor href={`../`} component="a">
                            Back to study
                        </Anchor>
                    </Group>
                </Stack>
            </Container>
        )
    }

    return (
        <Container size="sm" pt="xl">
            <Stack gap="md" align="center">
                <Loader />
                <Title order={3}>{message}</Title>
                <Text c="dimmed">This usually takes a couple of seconds.</Text>
            </Stack>
        </Container>
    )
}
