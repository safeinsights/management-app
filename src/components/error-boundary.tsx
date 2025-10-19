// error boundaries are class components @link https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
'use client'

import {
    AppShell,
    AppShellFooter,
    AppShellHeader,
    AppShellMain,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core'
import * as Sentry from '@sentry/nextjs'
import { Component, ErrorInfo, ReactNode } from 'react'
import { AppErrorImage } from '../../public/svg/app-error-image'
import { SafeInsightsLogo } from './layout/svg/si-logo'

interface Props {
    children?: ReactNode
    errorCode?: string
}

interface State {
    hasError: boolean
    eventId?: string
    navigating?: boolean
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, navigating: false }
    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        const eventId = Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
        this.setState({ eventId })
    }

    render() {
        if (this.state.hasError) {
            return (
                <AppShell header={{ height: 70 }} footer={{ height: 60 }}>
                    <AppShellHeader bg="purple.8" withBorder={false}>
                        <Group h="100%" p="md">
                            <SafeInsightsLogo width={250} height={54} />
                        </Group>
                    </AppShellHeader>

                    <AppShellMain
                        bg="purple.8"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        px="md"
                    >
                        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
                            <AppErrorImage style={{ margin: '0 auto' }} />
                            <Stack mb="xxl" ta="center" align="center" gap="0">
                                <Title order={1} fw={800} mt="sm">
                                    Something Went Wrong
                                </Title>
                                <Text size="md" fw={400} c="grey.6" mt="md">
                                    We&apos;re experiencing a technical issue. <br /> Please try again in a few minutes.
                                </Text>
                                {this.state.eventId && (
                                    <Text size="sm" fw={600} c="grey.5" mt="sm">
                                        Error ID: {this.state.eventId}
                                    </Text>
                                )}
                                <Group gap="md" mt="xl">
                                    <Button size="md" variant="outline" onClick={() => window.location.reload()}>
                                        Refresh
                                    </Button>
                                    <Button
                                        size="md"
                                        loading={this.state.navigating}
                                        onClick={() =>
                                            this.setState({ navigating: true }, () => {
                                                window.location.href = '/'
                                            })
                                        }
                                    >
                                        Take me back
                                    </Button>
                                </Group>
                            </Stack>
                        </Paper>
                    </AppShellMain>
                    <AppShellFooter p="md" bg="purple.9" bd="none">
                        <Group justify="left" c="white">
                            <Text c="white">© 2025 - SafeInsights, Rice University</Text>
                        </Group>
                    </AppShellFooter>
                </AppShell>
            )
        }
        return this.props.children
    }
}
