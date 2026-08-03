import { Stack, Title } from '@mantine/core'
import { LegalTabs } from './legal-tabs'

export default async function SafeInsightsLegalPage() {
    return (
        <Stack gap="xl">
            <Title order={1}>SafeInsights Legal</Title>
            <LegalTabs />
        </Stack>
    )
}
