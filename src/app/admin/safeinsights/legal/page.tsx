import { Stack, Title } from '@mantine/core'
import LegalUpload from './legal-upload'

export default async function SafeInsightsLegalPage() {
    return (
        <Stack gap="xl">
            <Title order={1}>SafeInsights Legal</Title>
            <LegalUpload doctype="tos" />
            <LegalUpload doctype="pn" />
        </Stack>
    )
}
