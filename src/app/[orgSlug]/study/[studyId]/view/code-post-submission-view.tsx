'use client'

import { useCallback, useState, type FC } from 'react'
import { Alert, Anchor, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretRightIcon, CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import type { Route } from 'next'
import { displayOrgName } from '@/lib/string'
import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import { ButtonLink } from '@/components/links'
import { Routes } from '@/lib/routes'
import { SubmittedCodeTable } from '@/components/study/submitted-code-table'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { filterAndOrderCodeFiles } from '@/app/[orgSlug]/study/[studyId]/review/study-code-files'

type CodeFileList = LatestJobForStudy['files']

interface CodePostSubmissionViewProps {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    reviewingOrgName: string
    dashboardHref?: Route
    /** 1 = first submission, >=2 = resubmission round. */
    submissionVersion?: number
    /** Reviewer feedback + resubmission notes for v2+. */
    feedbackEntries?: CodeReviewFeedbackEntry[]
    isUnderReview?: boolean
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

const SubmittedTimestamp: FC<{ label: string; date: string | null }> = ({ label, date }) => {
    if (!date) return null
    return (
        <Text fz={12} c="charcoal.7" data-testid="code-submitted-timestamp">
            {label} {date}
        </Text>
    )
}

const UnderReviewBanner: FC<{ isVisible: boolean; reviewingOrgName: string; isResubmission: boolean }> = ({
    isVisible,
    reviewingOrgName,
    isResubmission,
}) => {
    if (!isVisible) return null
    const verb = isResubmission ? 'has been resubmitted to' : 'has been submitted to'
    return (
        <Alert color="yellow" mt="md" bg="#FFF9E5" data-testid="code-under-review-banner">
            Your study code {verb} {displayOrgName(reviewingOrgName)}. They will have access to your study code and an
            AI-generated summary of its behavior. Please allow 7-10 business days for review. You’ll receive email
            notifications about updates.
        </Alert>
    )
}

const ExpandToggle: FC<{ isVisible: boolean; onClick: () => void }> = ({ isVisible, onClick }) => {
    if (!isVisible) return null
    return (
        <Anchor
            component="button"
            size="sm"
            fw={700}
            onClick={onClick}
            mt="md"
            display="inline-flex"
            style={{ alignItems: 'center', gap: 4 }}
            aria-expanded={false}
            data-testid="study-code-toggle"
        >
            View full study code
            <CaretRightIcon size={12} />
        </Anchor>
    )
}

const InlineToggle: FC<{ isVisible: boolean; expanded: boolean; onClick: () => void }> = ({
    isVisible,
    expanded,
    onClick,
}) => {
    if (!isVisible) return null
    return (
        <Anchor
            component="button"
            size="sm"
            fw={700}
            onClick={onClick}
            mt="md"
            display="inline-flex"
            style={{ alignItems: 'center', gap: 4 }}
            aria-expanded={expanded}
            data-testid="study-code-toggle"
        >
            {expanded ? 'Hide submitted study code' : 'View submitted study code'}
            <CaretRightIcon size={12} weight="bold" style={{ transform: expanded ? 'rotate(-90deg)' : undefined }} />
        </Anchor>
    )
}

const InlineCodePanel: FC<{ isVisible: boolean; expanded: boolean; jobId: string; files: CodeFileList }> = ({
    isVisible,
    expanded,
    jobId,
    files,
}) => {
    if (!isVisible) return null
    return (
        <Collapse in={expanded}>
            <Stack gap="md" mt="md">
                <Divider />
                <Text>View the code files that you uploaded to run against the dataset.</Text>
                <SubmittedCodeTable jobId={jobId} files={files} />
            </Stack>
        </Collapse>
    )
}

interface ExpandedCodePanelProps {
    isVisible: boolean
    expanded: boolean
    jobId: string
    files: CodeFileList
    proposalHref: Route
    onCollapse: () => void
}

const ExpandedCodePanel: FC<ExpandedCodePanelProps> = ({
    isVisible,
    expanded,
    jobId,
    files,
    proposalHref,
    onCollapse,
}) => {
    if (!isVisible) return null
    return (
        <Collapse in={expanded}>
            <Paper p="xxl">
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Title order={5}>Submitted code</Title>
                        <Anchor href={proposalHref} target="_blank" rel="noopener noreferrer" fw={700} size="sm">
                            View approved initial request
                        </Anchor>
                    </Group>
                    <Divider />
                    <Text>View the code files that you uploaded to run against the dataset.</Text>
                    <SubmittedCodeTable jobId={jobId} files={files} />
                    <Anchor
                        component="button"
                        size="sm"
                        fw={700}
                        onClick={onCollapse}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                        Hide full study code
                        <CaretRightIcon size={12} style={{ transform: 'rotate(-90deg)' }} />
                    </Anchor>
                </Stack>
            </Paper>
        </Collapse>
    )
}

const FeedbackSection: FC<{ isVisible: boolean; entries: CodeReviewFeedbackEntry[] }> = ({ isVisible, entries }) => {
    if (!isVisible) return null
    return <FeedbackAndNotesSection entries={entries} />
}

export function CodePostSubmissionView({
    orgSlug,
    study,
    job,
    reviewingOrgName,
    dashboardHref,
    submissionVersion = 1,
    feedbackEntries = [],
    isUnderReview = true,
}: CodePostSubmissionViewProps) {
    const { expanded, toggle, collapse } = useExpandable()

    const isResubmission = submissionVersion > 1
    const sectionTitle = isResubmission ? `Study code v${submissionVersion}.0` : 'Study code'
    const timestampLabel = isResubmission ? 'Resubmitted on' : 'Submitted on'
    const submittedOn = getCodeSubmittedDate(job)

    const dashboard = dashboardHref ?? Routes.dashboard
    const proposalHref = Routes.studySubmitted({ orgSlug, studyId: study.id })
    const previousHref = Routes.studyAgreements({ orgSlug, studyId: study.id, from: 'previous' })

    const breadcrumbs: Array<[string, string?]> = [
        ['Dashboard', dashboard],
        ['Study proposal', proposalHref],
        ['Study code'],
    ]

    const codeFiles = filterAndOrderCodeFiles(job.files)

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
                        {sectionTitle}
                    </Title>
                    <Group justify="space-between" align="center">
                        <Text c="charcoal.9" maw="60ch" style={{ wordBreak: 'break-word' }}>
                            Title: {study.title}
                        </Text>
                        <SubmittedTimestamp label={timestampLabel} date={submittedOn} />
                    </Group>
                    <Divider my="md" />
                    <UnderReviewBanner
                        isVisible={isUnderReview}
                        reviewingOrgName={reviewingOrgName}
                        isResubmission={isResubmission}
                    />
                    <ExpandToggle isVisible={!isResubmission && !expanded} onClick={toggle} />
                    <InlineToggle isVisible={isResubmission} expanded={expanded} onClick={toggle} />
                    <InlineCodePanel isVisible={isResubmission} expanded={expanded} jobId={job.id} files={codeFiles} />
                </Paper>

                <ExpandedCodePanel
                    isVisible={!isResubmission}
                    expanded={expanded}
                    jobId={job.id}
                    files={codeFiles}
                    proposalHref={proposalHref}
                    onCollapse={collapse}
                />

                <FeedbackSection isVisible={isResubmission && feedbackEntries.length > 0} entries={feedbackEntries} />

                <Group justify="space-between">
                    <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                        Back
                    </ButtonLink>
                    <ButtonLink href={dashboard} size="md">
                        Go to dashboard
                    </ButtonLink>
                </Group>
            </Stack>
        </Stack>
    )
}
