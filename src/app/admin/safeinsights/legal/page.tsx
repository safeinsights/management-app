import type { Metadata } from 'next'
import { Stack, Title } from '@mantine/core'
import { LegalTabs } from './legal-tabs'

export const metadata: Metadata = { title: 'SafeInsights Legal' }

export default async function SafeInsightsLegalPage() {
    return (
        <Stack gap="xl">
            <Title order={1}>SafeInsights Legal</Title>
            <LegalTabs />
        </Stack>
    )
}
