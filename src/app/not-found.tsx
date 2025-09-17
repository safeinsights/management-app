'use client'

import { SafeInsightsLogo } from '@/components/layout/si-logo'
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
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { NotFoundImage } from '../../public/svg/404-image'

export default function NotFound() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

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
                <Paper bg="white" p="xxl" radius="sm" maw={600} my={{ base: '1rem', lg: 0 }}>
                    <Stack mb="xxl" ta="center" align="center" gap="0">
                        <NotFoundImage style={{ margin: '0 auto' }} />
                        <Title order={1} fw={800} mt="sm">
                            Page Not Found
                        </Title>
                        <Text size="md" fw={400} c="grey.6" mt="md">
                            The page you are trying to open does not exist. <br />
                            The page address may have been mistyped, or the page <br /> has been moved to another URL.
                        </Text>
                        <Button
                            size="md"
                            loading={loading}
                            onClick={() => {
                                setLoading(true)
                                router.push('/')
                            }}
                            mt="xl"
                            style={{ margin: '0 auto' }}
                        >
                            Take me back
                        </Button>
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
