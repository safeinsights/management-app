'use client'

import { FocusedLayoutShellView } from '@/components/layout/focused-layout-shell-view'
import { Routes } from '@/lib/routes'
import { Button, Paper, Stack, Text, Title } from '@mantine/core'
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
        <FocusedLayoutShellView>
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
        </FocusedLayoutShellView>
    )
}
