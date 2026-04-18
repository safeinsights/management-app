import { Button, Paper, Stack, Text, Title } from '@mantine/core'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { displayOrgName } from '@/lib/string'
import { PostSubmissionFeatureFlag } from '@/components/openstax-feature-flag'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { StudyRequestPageHeader } from '../../request/page-header'
import { SubmittedProposalPreview } from './submitted-proposal-preview'
import { ProposalSubmitted } from './proposal-submitted'

interface SubmittedViewProps {
    orgSlug: string
    study: SelectedStudy
    orgName: string
}

export function SubmittedView({ orgSlug, study, orgName }: SubmittedViewProps) {
    const existingView = (
        <Stack p="xl" gap="xl">
            <StudyRequestPageHeader orgSlug={orgSlug} studyId={study.id} studyTitle={study.title} />
            <Paper p="xl">
                <Stack align="center" gap="md" py="xl">
                    <CheckCircleIcon size={60} weight="fill" color="var(--mantine-color-green-9)" />
                    <Title order={5} c="green.9">
                        Your study proposal has been submitted successfully.
                    </Title>
                    <Text ta="center" maw={800}>
                        {displayOrgName(orgName)} will follow up with feedback, follow-up questions, or a decision.
                        Please check your dashboard for notifications and status updates.
                    </Text>
                    <SubmittedProposalPreview study={study} orgSlug={orgSlug} />
                </Stack>
            </Paper>
            <Stack gap="sm" align="flex-end">
                <Button component={Link} href={Routes.orgDashboard({ orgSlug })} size="md">
                    Go to dashboard
                </Button>
            </Stack>
        </Stack>
    )

    return (
        <PostSubmissionFeatureFlag
            defaultContent={existingView}
            optInContent={<ProposalSubmitted orgSlug={orgSlug} study={study} orgName={orgName} />}
        />
    )
}
