// error boundaries are class components @link https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
'use client'

import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import * as Sentry from '@sentry/nextjs'
import { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react'
import { AppErrorImage } from '../../public/svg/app-error-image'
import { StandaloneScreenShell } from './layout/standalone-screen-shell'
import { fontWeight, semanticColor } from '@/theme/tokens'
import { APP_TITLE, MAIN_CONTENT_ID } from '@/lib/constants'

interface Props {
    children?: ReactNode
    errorCode?: string
}

interface State {
    hasError: boolean
    eventId?: string
}

// The boundary can trip without a navigation (a render error after a click), so useRouteFocus never
// sees it; the screen retitles the tab and takes focus itself.
function useErrorScreenArrival() {
    useEffect(() => {
        document.title = `Something went wrong - ${APP_TITLE}`
        document.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true })
    }, [])
}

export function ErrorScreen({ eventId }: { eventId?: string }) {
    const [navigating, setNavigating] = useState(false)
    useErrorScreenArrival()

    const goHome = () => {
        setNavigating(true)
        window.location.href = '/'
    }

    return (
        <StandaloneScreenShell>
            <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
                <AppErrorImage style={{ margin: '0 auto' }} />
                <Stack mb="xxl" ta="center" align="center" gap="0">
                    <Title order={1} fw={800} mt="sm">
                        Something Went Wrong
                    </Title>
                    <Text size="md" fw={fontWeight.regular} c="grey.6" mt="md">
                        We’re experiencing a technical issue. <br /> Please try again in a few minutes.
                    </Text>
                    <ErrorId eventId={eventId} />
                    <Group gap="md" mt="xl">
                        <Button size="md" variant="outline" onClick={() => window.location.reload()}>
                            Refresh
                        </Button>
                        <Button size="md" loading={navigating} onClick={goHome}>
                            Take me back
                        </Button>
                    </Group>
                </Stack>
            </Paper>
        </StandaloneScreenShell>
    )
}

function ErrorId({ eventId }: { eventId?: string }) {
    if (!eventId) return null

    return (
        <Text size="sm" fw={fontWeight.semibold} c="grey.5" mt="sm">
            Error ID: {eventId}
        </Text>
    )
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false }
    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        const eventId = Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
        this.setState({ eventId })
    }

    render() {
        if (this.state.hasError) return <ErrorScreen eventId={this.state.eventId} />
        return this.props.children
    }
}
