'use client'

import { useQuery, type FC } from '@/common'
import { formatDayString } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import { fetchOrgParticipationAgreementAction } from '@/server/actions/legal-document.actions'
import { Anchor, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'

type Agreement = NonNullable<ActionSuccessType<typeof fetchOrgParticipationAgreementAction>['agreement']>

// One record by construction — an org signs one participation agreement, and only its latest
// published version is on show — so this is a small read-out rather than a one-row table.
const AgreementDetails: FC<{ agreement: Agreement }> = ({ agreement }) => (
    <Stack gap="xs">
        <Text>Effective on: {formatDayString(agreement.signedAt)}</Text>
        <Group gap={4}>
            <Anchor href={agreement.downloadUrl} target="_blank" rel="noreferrer">
                PDF <ArrowSquareOutIcon size={14} />
            </Anchor>
        </Group>
    </Stack>
)

const EmptyState: FC<{ label: string }> = ({ label }) => (
    <Stack gap={4}>
        <Text>No {label} yet.</Text>
        <Text c="dimmed">It will appear here once SafeInsights has countersigned it.</Text>
    </Stack>
)

// The three states of one record — still loading, nothing on file, on file — resolved here so the
// panel's own return stays a heading and a body.
const AgreementBody: FC<{ isLoading: boolean; agreement: Agreement | null | undefined; label: string }> = ({
    isLoading,
    agreement,
    label,
}) => {
    if (isLoading) return <Loader size="sm" />
    if (!agreement) return <EmptyState label={label} />

    return <AgreementDetails agreement={agreement} />
}

export const OrgParticipationAgreement: FC<{ orgSlug: string; type: ParticipationAgreementType }> = ({
    orgSlug,
    type,
}) => {
    const { data, isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.orgParticipationAgreement(orgSlug),
        queryFn: () => fetchOrgParticipationAgreementAction({ orgSlug }),
    })

    const label = legalDocumentTypeLabels[type]

    return (
        <Paper shadow="xs" p="xl">
            <Title order={3} mb="lg">
                {label}
            </Title>
            <AgreementBody isLoading={isLoading} agreement={data?.agreement} label={label} />
        </Paper>
    )
}
