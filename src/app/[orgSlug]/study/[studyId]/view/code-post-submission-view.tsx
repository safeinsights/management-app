'use client'

import { type FC } from 'react'
import { Anchor, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon, CaretRightIcon } from '@phosphor-icons/react/dist/ssr'
import type { Route } from 'next'
import { displayOrgName } from '@/lib/string'
import { LinkWithIcon } from '@/components/links'
import { StepNavigation } from '@/components/study/step-navigation'
import type { StepNav } from '@/lib/study-screen'
import { Routes } from '@/lib/routes'
import { SubmittedCodeTable } from '@/components/study/submitted-code-table'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { CodeReviewFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { filterAndOrderCodeFiles } from '@/app/[orgSlug]/study/[studyId]/review/study-code-files'
import { useExpandable } from '@/hooks/use-expandable'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { researcherCodeSubmittedBanner } from '@/lib/study-banners'
import { StudyCodeToggle } from './study-code-collapse'

type CodeFileList = LatestJobForStudy['files']

interface CodePostSubmissionViewProps {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    reviewingOrgName: string
    nav: StepNav
    /** 1 = first submission, >=2 = resubmission round. */
    submissionVersion?: number
    feedbackEntries?: CodeReviewFeedbackEntry[]
    isUnderReview?: boolean
}

const codeSubmittedAt = (job: LatestJobForStudy): Date | string | null =>
    job.statusChanges.find((s) => s.status === 'CODE-SUBMITTED')?.createdAt ?? null

type UnderReviewBannerProps = {
    isVisible: boolean
    reviewingOrgName: string
    submissionVersion: number
    submittedAt: Date | string | null
}

const UnderReviewBanner: FC<UnderReviewBannerProps> = ({
    isVisible,
    reviewingOrgName,
    submissionVersion,
    submittedAt,
}) => {
    if (!isVisible) return null

    const copy = researcherCodeSubmittedBanner({
        dataPartner: displayOrgName(reviewingOrgName),
        version: submissionVersion,
    })

    return (
        <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, submittedAt)}>
            {copy.body}
        </StatusAlert>
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
                        <Title order={3} size="h5">
                            Submitted code
                        </Title>
                        <LinkWithIcon
                            href={proposalHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            icon={<ArrowSquareOutIcon size={14} />}
                            data-testid="view-approved-initial-request"
                        >
                            View approved initial request
                        </LinkWithIcon>
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
    return <FeedbackAndNotesSection entries={entries} alwaysExpandLatest />
}

export function CodePostSubmissionView({
    orgSlug,
    study,
    job,
    reviewingOrgName,
    nav,
    submissionVersion = 1,
    feedbackEntries = [],
    isUnderReview = true,
}: CodePostSubmissionViewProps) {
    const { expanded, toggle, collapse } = useExpandable()

    const isResubmission = submissionVersion > 1
    const sectionTitle = isResubmission ? `Study code v${submissionVersion}.0` : 'Study code'
    const submittedAt = codeSubmittedAt(job)

    const proposalHref = Routes.studySubmitted({ orgSlug, studyId: study.id })

    const codeFiles = filterAndOrderCodeFiles(job.files)

    return (
        <Stack p="xl" gap="xxl">
            <StudyPageHeader study={study} />

            <Stack gap="xxl">
                <Paper p="xxl">
                    <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                        STEP 4
                    </Text>
                    <Title fz={20} order={2} c="charcoal.9" pb={4}>
                        {sectionTitle}
                    </Title>
                    <Text c="charcoal.9" maw="60ch" style={{ wordBreak: 'break-word' }}>
                        Title: {study.title}
                    </Text>
                    <Divider my="md" />
                    <UnderReviewBanner
                        isVisible={isUnderReview}
                        reviewingOrgName={reviewingOrgName}
                        submissionVersion={submissionVersion}
                        submittedAt={submittedAt}
                    />
                    <ExpandToggle isVisible={!isResubmission && !expanded} onClick={toggle} />
                    <StudyCodeToggle isVisible={isResubmission} expanded={expanded} onClick={toggle} mt="md" />
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

                <StepNavigation nav={nav} />
            </Stack>
        </Stack>
    )
}
