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
import { ErrorAlert } from '@/components/errors'
import { LinkWithIcon } from '@/components/links'
import { LoadingMessage } from '@/components/loading'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'

type Agreement = NonNullable<ActionSuccessType<typeof fetchOrgParticipationAgreementAction>['agreement']>

// One record by construction, so a read-out rather than a one-row table.
const AgreementDetails: FC<{ agreement: Agreement }> = ({ agreement }) => (
    <Stack gap="xs" align="flex-start">
        <Text>Effective on: {formatDayString(agreement.signedAt)}</Text>
        <LinkWithIcon
            href={agreement.downloadUrl}
            target="_blank"
            rel="noreferrer"
            icon={<ArrowSquareOutIcon size={14} />}
        >
            PDF
        </LinkWithIcon>
    </Stack>
)

const EmptyState: FC<{ label: string }> = ({ label }) => (
    <Stack gap={4}>
        <Text>No {label} yet.</Text>
        <Text c="dimmed">It will appear here once SafeInsights has countersigned it.</Text>
    </Stack>
)

// isError first: a refused read leaves data undefined, and falling through would claim nothing is
// on file when we never managed to look.
const AgreementBody: FC<{
    isLoading: boolean
    isError: boolean
    error: unknown
    agreement: Agreement | null | undefined
    label: string
}> = ({ isLoading, isError, error, agreement, label }) => {
    if (isError) return <ErrorAlert error={error} />
    if (isLoading) return <LoadingMessage message="Loading..." />
    if (!agreement) return <EmptyState label={label} />

    return <AgreementDetails agreement={agreement} />
}

export const OrgParticipationAgreement: FC<{ orgSlug: string; type: ParticipationAgreementType }> = ({
    orgSlug,
    type,
}) => {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: legalDocumentQueryKeys.orgParticipationAgreement(orgSlug),
        queryFn: () => fetchOrgParticipationAgreementAction({ orgSlug }),
    })

    const label = legalDocumentTypeLabels[type]

    return (
        <Paper shadow="xs" p="xl">
            <Title order={3} mb="lg">
                {label}
            </Title>
            <AgreementBody
                isLoading={isLoading}
                isError={isError}
                error={error}
                agreement={data?.agreement}
                label={label}
            />
        </Paper>
    )
}
