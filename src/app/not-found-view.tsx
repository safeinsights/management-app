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
            <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" maw={600} my={{ base: '1rem', lg: 0 }}>
                <Stack mb="xxl" ta="center" align="center" gap="0">
                    <NotFoundImage style={{ margin: '0 auto' }} />
                    <Title order={1} fw={800} mt="sm">
                        Page Not Found
                    </Title>
                    <Text size="md" fw={fontWeight.regular} c="grey.6" mt="md">
                        The page you are trying to open does not exist. <br />
                        The page address may have been mistyped, or the page <br /> has been moved to another URL.
                    </Text>
                    <Button size="md" loading={loading} onClick={goHome} mt="xl" style={{ margin: '0 auto' }}>
                        Take me back
                    </Button>
                </Stack>
            </Paper>
        </FocusedLayoutShellView>
    )
}
