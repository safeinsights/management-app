'use client'

import { useCallback, useState, type FC } from 'react'
import { Alert, Anchor, Button, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretRightIcon, CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { displayOrgName } from '@/lib/string'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { Link, ButtonLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { SubmittedCodeTable } from '@/components/study/submitted-code-table'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

interface CodePostSubmissionViewProps {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    reviewingOrgName: string
    dashboardHref?: string
}

function useExpandable(initial = false) {
    const [expanded, setExpanded] = useState(initial)
    const toggle = useCallback(() => setExpanded((prev) => !prev), [])
    const collapse = useCallback(() => setExpanded(false), [])
    return { expanded, toggle, collapse }
}

const getCodeSubmittedDate = (job: LatestJobForStudy): string | null => {
    const row = job.statusChanges.find((s) => s.status === 'CODE-SUBMITTED')
    return row ? dayjs(row.createdAt).format('MMM DD, YYYY') : null
}

const SubmittedTimestamp: FC<{ submittedOn: string | null }> = ({ submittedOn }) => {
    if (!submittedOn) return null
    return (
        <Text fz={12} c="charcoal.7" data-testid="code-submitted-timestamp">
            Submitted on {submittedOn}
        </Text>
    )
}

export function CodePostSubmissionView({
    orgSlug,
    study,
    job,
    reviewingOrgName,
    dashboardHref,
}: CodePostSubmissionViewProps) {
    const { expanded, toggle, collapse } = useExpandable()

    const submittedOn = getCodeSubmittedDate(job)
    const dashboard = dashboardHref ?? Routes.dashboard
    const proposalHref = Routes.studySubmitted({ orgSlug, studyId: study.id })
    const previousHref = Routes.studyAgreements({ orgSlug, studyId: study.id, from: 'previous' })

    const breadcrumbs: Array<[string, string?]> = [
        ['Dashboard', dashboard],
        ['Study proposal', proposalHref],
        ['Study code'],
    ]

    const toggleLabel = expanded ? 'Hide full study code' : 'View full study code'
    const caretRotation = expanded ? 'rotate(-90deg)' : 'rotate(0deg)'

    return (
        <Stack p="xl" gap="xl">
            <PageBreadcrumbs crumbs={breadcrumbs} />
            <Title order={1}>Study proposal</Title>

            <Stack gap="xxl">
                <Paper p="xxl">
                    <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                        STEP 4
                    </Text>
                    <Title fz={20} order={4} c="charcoal.9" pb={4}>
                        Study code
                    </Title>
                    <Group justify="space-between" align="center">
                        <Text c="charcoal.9" maw="60ch" style={{ wordBreak: 'break-word' }}>
                            Title: {study.title}
                        </Text>
                        <SubmittedTimestamp submittedOn={submittedOn} />
                    </Group>
                    <Divider my="md" />
                    <Alert color="yellow" mt="md" bg="#FFF9E5" data-testid="code-under-review-banner">
                        Your study code has been successfully submitted to {displayOrgName(reviewingOrgName)}. They will
                        review it and respond with feedback, follow-up questions, or a decision. You&apos;ll receive
                        email notifications as your code progresses through the review process. Please allow an
                        estimated 7-10 days for a complete code review. Review timelines vary by data organization.
                    </Alert>
                    <Anchor
                        component="button"
                        size="sm"
                        fw={700}
                        onClick={toggle}
                        mt="md"
                        display="inline-flex"
                        style={{ alignItems: 'center', gap: 4 }}
                        aria-expanded={expanded}
                        data-testid="study-code-toggle"
                    >
                        {toggleLabel}
                        <CaretRightIcon size={12} style={{ transition: 'transform 200ms', transform: caretRotation }} />
                    </Anchor>
                </Paper>

                <Collapse in={expanded}>
                    <Paper p="xxl">
                        <Stack gap="md">
                            <Title order={5}>Submitted code</Title>
                            <Anchor href={proposalHref} target="_blank" rel="noopener noreferrer" fw={700} size="sm">
                                View approved initial request
                            </Anchor>
                            <Divider />
                            <Text>View the code files that you uploaded to run against the dataset.</Text>
                            <SubmittedCodeTable jobId={job.id} files={job.files} />
                            <Anchor
                                component="button"
                                size="sm"
                                fw={700}
                                onClick={collapse}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                                Hide full study code
                                <CaretRightIcon size={12} style={{ transform: 'rotate(-90deg)' }} />
                            </Anchor>
                        </Stack>
                    </Paper>
                </Collapse>

                <Group justify="space-between">
                    <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                        Previous
                    </ButtonLink>
                    <Button component={Link} href={dashboard} size="md">
                        Go to dashboard
                    </Button>
                </Group>
            </Stack>
        </Stack>
    )
}
