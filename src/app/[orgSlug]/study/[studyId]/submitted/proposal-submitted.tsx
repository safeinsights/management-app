'use client'

import type { FC } from 'react'
import { Alert, Button, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { displayOrgName } from '@/lib/string'
import { ErrorAlert } from '@/components/errors'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { StudyStatus } from '@/database/types'
import type { Submitted } from '@/schema/study'
import { ProposalHeader } from '../../request/page-header'
import { Routes } from '@/lib/routes'
import { Link } from '@/components/links'
import { effectiveProposalStatus } from '@/lib/review-decision'
import { STATUS_BANNER_BG } from '@/lib/status-banner-colors'

interface ProposalSubmittedProps {
    orgSlug: string
    study: Submitted<SelectedStudy>
    orgName: string
    entries: ProposalFeedbackEntry[]
    studyVersion: number
    feedbackError?: boolean
    returnTo?: 'org'
}

function proposalHeading(studyVersion: number): string {
    if (studyVersion <= 1) return 'Initial request'
    return `Initial request ${studyVersion}.0`
}

type ProposalBannerConfig = {
    color: string
    bg?: string
    message: (orgName: string) => string
    statusBadge?: string
}

const PROPOSAL_BANNERS: Partial<Record<StudyStatus, ProposalBannerConfig>> = {
    'PENDING-REVIEW': {
        color: 'yellow',
        message: (orgName) =>
            `Your initial request has been successfully submitted to ${displayOrgName(orgName)}. They will review it and respond with feedback or a decision. You'll receive email notifications as your request progresses through the review process. Please allow an estimated 7 to 10 days for a complete review.`,
    },
    APPROVED: {
        color: 'green',
        bg: STATUS_BANNER_BG.approved,
        statusBadge: 'Approved on',
        message: (orgName) =>
            `${displayOrgName(orgName)} has reviewed and approved your initial request. Review their feedback below, then proceed to Step 3 - Agreements to sign the required legal documents.`,
    },
    REJECTED: {
        color: 'red',
        bg: STATUS_BANNER_BG.rejected,
        statusBadge: 'Rejected on',
        message: (orgName) =>
            `${displayOrgName(orgName)} has reviewed your initial request and is unable to support it at this time. Please review their feedback below for more details.`,
    },
    'CHANGE-REQUESTED': {
        color: 'purple',
        bg: STATUS_BANNER_BG.changesRequestedResearcher,
        statusBadge: 'Clarification requested on',
        message: (orgName) =>
            `${displayOrgName(orgName)} has reviewed your initial request and has requested clarifications. Please review their feedback below. You can revise and resubmit your request to address their questions.`,
    },
}

function StatusBanner({
    orgName,
    study,
    studyVersion,
}: {
    orgName: string
    study: Pick<SelectedStudy, 'status' | 'approvedAt' | 'rejectedAt'>
    studyVersion: number
}) {
    const proposalStatus = effectiveProposalStatus(study)
    const config = PROPOSAL_BANNERS[proposalStatus]
    if (!config) return null

    const isResubmission = proposalStatus === 'PENDING-REVIEW' && studyVersion > 1
    const message = isResubmission
        ? `Your revised initial request has been resubmitted to ${displayOrgName(orgName)}. They will review your changes and respond with feedback or a decision. You'll receive email notifications as your request progresses through the review process.`
        : config.message(orgName)

    return (
        <Alert color={config.color} bg={config.bg} mb="md" data-testid={`status-banner-${proposalStatus}`}>
            {message}
        </Alert>
    )
}

const ProposalNavigation: FC<{ orgSlug: string; study: SelectedStudy; returnTo?: 'org' }> = ({
    orgSlug,
    study,
    returnTo,
}) => {
    const studyParams = { orgSlug, studyId: study.id }
    const dashboardHref = returnTo ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard
    const proposalStatus = effectiveProposalStatus(study)

    switch (proposalStatus) {
        case 'CHANGE-REQUESTED':
            return (
                <Group justify="space-between">
                    <Button
                        component={Link}
                        href={dashboardHref}
                        variant="subtle"
                        size="md"
                        leftSection={<CaretLeftIcon />}
                    >
                        Back
                    </Button>
                    <Button component={Link} href={Routes.studyEditAndResubmit(studyParams)} size="md">
                        Edit and resubmit
                    </Button>
                </Group>
            )
        case 'APPROVED':
            return (
                <Group justify="space-between">
                    <Button
                        component={Link}
                        href={dashboardHref}
                        variant="subtle"
                        size="md"
                        leftSection={<CaretLeftIcon />}
                    >
                        Back
                    </Button>
                    <Button
                        component={Link}
                        href={Routes.studyResearcherAgreements({ orgSlug, studyId: study.id, returnTo })}
                        size="md"
                    >
                        Proceed to step 3
                    </Button>
                </Group>
            )
        default:
            return (
                <Group justify="flex-end">
                    <Button component={Link} href={dashboardHref} size="md">
                        Go to dashboard
                    </Button>
                </Group>
            )
    }
}

const STATUSES_EXPECTING_FEEDBACK: StudyStatus[] = ['APPROVED', 'REJECTED', 'CHANGE-REQUESTED']

function FeedbackErrorAlert({ status, feedbackError }: { status: StudyStatus; feedbackError?: boolean }) {
    if (!feedbackError || !STATUSES_EXPECTING_FEEDBACK.includes(status)) return null

    return (
        <ErrorAlert
            error="Unable to load feedback and notes. Please try refreshing the page."
            data-testid="feedback-error-alert"
        />
    )
}

export function ProposalSubmitted({
    orgSlug,
    study,
    orgName,
    entries,
    studyVersion,
    feedbackError,
    returnTo,
}: ProposalSubmittedProps) {
    const proposalStatus = effectiveProposalStatus(study)
    const bannerConfig = PROPOSAL_BANNERS[proposalStatus]
    const statusBadge = bannerConfig?.statusBadge ?? (studyVersion > 1 ? 'Resubmitted on' : undefined)

    return (
        <Stack p="xl" gap="xl">
            <ProposalHeader orgSlug={orgSlug} title="Study proposal" studyId={study.id} studyTitle={study.title} />
            <Stack gap="xxl">
                <ProposalRequest
                    study={study}
                    orgSlug={orgSlug}
                    stepLabel="STEP 2"
                    heading={proposalHeading(studyVersion)}
                    banner={<StatusBanner orgName={orgName} study={study} studyVersion={studyVersion} />}
                    statusBadge={statusBadge}
                    entries={entries}
                    initialExpanded={false}
                />
                <FeedbackErrorAlert status={proposalStatus} feedbackError={feedbackError} />
                <FeedbackAndNotesSection entries={entries} />
                <ProposalNavigation orgSlug={orgSlug} study={study} returnTo={returnTo} />
            </Stack>
        </Stack>
    )
}
