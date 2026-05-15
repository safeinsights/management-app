import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { Routes } from '@/lib/routes'
import { latestJobForStudy } from '@/server/db/queries'
import { Box, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import dayjs from 'dayjs'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { CodeReviewForm } from './code-review-form'

type CodeReviewRedesignViewProps = {
    orgSlug: string
    study: SelectedStudy
}

const CODE_REVIEW_CRITERIA = [
    {
        label: 'Proposal alignment',
        description: 'Does the code align with the approved research proposal?',
    },
    {
        label: 'Agreement compliance',
        description: 'Does the code comply with all the agreements?',
    },
    {
        label: 'Security checks',
        description: 'Have security and vulnerability checks been passed?',
    },
    {
        label: 'Privacy protection',
        description: 'Is there any risk of PII exposure expected in the outputs?',
    },
]

function formatDate(date: Date | string): string {
    return dayjs(date).format('MMM DD, YYYY')
}

function CodeReviewCriteriaList() {
    return (
        <Stack gap={4} data-testid="code-review-criteria">
            {CODE_REVIEW_CRITERIA.map(({ label, description }) => (
                <Text size="sm" key={label}>
                    <strong>{label}:</strong> {description}
                </Text>
            ))}
        </Stack>
    )
}

function CodeReviewStatusBanner({ labName }: { labName: string }) {
    return (
        <Box
            bg="purple.0"
            p="md"
            style={{ borderRadius: 'var(--mantine-radius-sm)' }}
            data-testid="code-review-status-banner"
        >
            <Stack gap="xs">
                <Text size="sm">
                    <strong>{labName}</strong> has submitted their study code for review. Below, you will review their
                    code and an AI-generated summary of its behavior, then share your feedback and decision.
                </Text>
                <CodeReviewCriteriaList />
            </Stack>
        </Box>
    )
}

type CodeReviewSectionProps = {
    study: SelectedStudy
    submittedAt: Date | string
}

function CodeReviewSection({ study, submittedAt }: CodeReviewSectionProps) {
    const labName = study.submittingLabName ?? study.submittedByOrgSlug

    return (
        <Paper p="xxl" data-testid="code-review-section-header">
            <Stack gap="md">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4}>
                        <Text fz="xs" fw={700} c="charcoal.7">
                            STEP 3
                        </Text>
                        <Title order={2} fz={20} fw={700}>
                            Review study code
                        </Title>
                        <Text size="sm">Title: {study.title}</Text>
                    </Stack>
                    <Text
                        fz={12}
                        c="charcoal.7"
                        style={{ whiteSpace: 'nowrap' }}
                        data-testid="code-review-submitted-on"
                    >
                        Submitted on {formatDate(submittedAt)}
                    </Text>
                </Group>
                <Divider />
                <CodeReviewStatusBanner labName={labName} />
            </Stack>
        </Paper>
    )
}

export async function CodeReviewRedesignView({ orgSlug, study }: CodeReviewRedesignViewProps) {
    const job = await latestJobForStudy(study.id)
    const proposalHref = `${Routes.studyReview({ orgSlug, studyId: study.id })}?from=code-review`
    const labName = study.submittingLabName ?? study.submittedByOrgSlug

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs
                    crumbs={[
                        ['Dashboard', Routes.orgDashboard({ orgSlug })],
                        ['Study proposal', proposalHref],
                        ['Study code'],
                    ]}
                />
                <Title order={1} fz={40} fw={700}>
                    Study Proposal
                </Title>
                <CodeReviewSection study={study} submittedAt={job.createdAt} />
                <CodeReviewForm labName={labName} orgSlug={orgSlug} studyId={study.id} />
            </Stack>
        </Box>
    )
}
