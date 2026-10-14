'use client'

import { AppFooter } from '@/components/layout/app-footer'
import { SafeInsightsLogo } from '@/components/layout/svg/si-logo'
import { MAIN_CONTENT_PROPS, SIDENAV_BG } from '@/lib/constants'
import { Routes } from '@/lib/routes'
import { AppShell, AppShellHeader, AppShellMain, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { NotFoundImage } from '../../public/svg/404-image'
import { fontWeight, semanticColor } from '@/theme/tokens'

export function NotFoundView() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    const goHome = () => {
        setLoading(true)
        router.push(Routes.home)
    }

    return (
        <AppShell header={{ height: 70 }} footer={{ height: 60 }}>
            <AppShellHeader bg={SIDENAV_BG} withBorder={false}>
                <Group h="100%" p="md">
                    <SafeInsightsLogo width={250} height={54} />
                </Group>
            </AppShellHeader>

            <AppShellMain {...MAIN_CONTENT_PROPS} bg={SIDENAV_BG} display="flex" px="md">
                <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" maw={600} m="auto">
                    <Stack mb="xxl" ta="center" align="center" gap="0">
                        <NotFoundImage />
                        <Title order={1} mt="sm">
                            Page Not Found
                        </Title>
                        <Text size="md" fw={fontWeight.regular} c={semanticColor('text.secondary')} mt="md">
                            The page you are trying to open does not exist. <br />
                            The page address may have been mistyped, or the page <br /> has been moved to another URL.
                        </Text>
                        <Button size="md" loading={loading} onClick={goHome} mt="xl">
                            Take me back
                        </Button>
                    </Stack>
                </Paper>
            </AppShellMain>
            <AppFooter isDark />
        </AppShell>
    )
}
