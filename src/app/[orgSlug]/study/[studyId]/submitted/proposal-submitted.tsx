'use client'

import type { FC } from 'react'
import { Button, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { displayOrgName } from '@/lib/string'
import { ErrorAlert } from '@/components/errors'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { PreviousStepLink } from '@/components/study/previous-step-link'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { StudyStatus } from '@/database/types'
import type { Submitted } from '@/schema/study'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { Link } from '@/components/links'
import { effectiveProposalStatus } from '@/lib/review-decision'
import { decisionTimestampForProposalHeader, researcherCodeStepHref } from '@/lib/studies'
import {
    STATUS_ALERT_VARIANT,
    StatusAlert,
    statusAlertTitle,
    type StatusAlertVariant,
} from '@/components/study/status-alert'

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

type ProposalBanner = {
    variant: StatusAlertVariant
    title: string
    body: string
}

const AWAITING_REVIEW_BODY =
    'An email notification will be sent as your proposal progresses through the review. Reviews typically take 7 to 10 days.'

function proposalBanner(status: StudyStatus, dataPartner: string, studyVersion: number): ProposalBanner | null {
    switch (status) {
        case 'PENDING-REVIEW':
            return {
                variant: STATUS_ALERT_VARIANT.informative,
                title:
                    studyVersion > 1
                        ? `Proposal v${studyVersion}.0 resubmitted to ${dataPartner}`
                        : `Proposal submitted to ${dataPartner}`,
                body: AWAITING_REVIEW_BODY,
            }
        case 'CHANGE-REQUESTED':
            return {
                variant: STATUS_ALERT_VARIANT.action,
                title: 'Revision requested',
                body: `${dataPartner} has reviewed your proposal and requested changes. Read their feedback below, then revise and resubmit.`,
            }
        case 'APPROVED':
            return {
                variant: STATUS_ALERT_VARIANT.success,
                title: 'Proposal approved',
                body: `${dataPartner} has reviewed and approved your proposal. Read their feedback below, then proceed to the next step.`,
            }
        case 'REJECTED':
            return {
                variant: STATUS_ALERT_VARIANT.decline,
                title: 'Proposal declined',
                body: `${dataPartner} has reviewed your proposal and is unable to support it. Read their feedback below for more details.`,
            }
        default:
            return null
    }
}

function StatusBanner({
    copy,
    study,
    entries,
}: {
    copy: ProposalBanner
    study: Submitted<SelectedStudy>
    entries: ProposalFeedbackEntry[]
}) {
    const decidedAt = decisionTimestampForProposalHeader(study, entries)

    return (
        <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, decidedAt)}>
            {copy.body}
        </StatusAlert>
    )
}

const ProposalNavigation: FC<{ orgSlug: string; study: SelectedStudy; returnTo?: 'org' }> = ({
    orgSlug,
    study,
    returnTo,
}) => {
    const dashboardHref = returnTo ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard
    const editAndResubmitHref = Routes.studyEditAndResubmit({ orgSlug, studyId: study.id })
    // Step 1, which serves the submitted study as a read-only record (OTTER-764). returnTo rides
    // along so the round trip back here lands on the same page the researcher came from, exit
    // included, rather than silently switching to the personal dashboard.
    const setupHref = Routes.studyEdit({ orgSlug, studyId: study.id, returnTo })
    const proposalStatus = effectiveProposalStatus(study)

    const proceedHref = researcherCodeStepHref(study, { orgSlug, returnTo })

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
                    <Button component={Link} href={editAndResubmitHref} size="md">
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
                    <Button component={Link} href={proceedHref} size="md">
                        Proceed to step 3
                    </Button>
                </Group>
            )
        default:
            // No forward action exists from here, so the researcher gets a step back to the read-only
            // Step 1 record alongside the exit (OTTER-764). The two branches above keep their own
            // designed navigation.
            return (
                <Group justify="space-between">
                    <PreviousStepLink previousHref={setupHref} size="md" />
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
    const bannerCopy = proposalBanner(proposalStatus, displayOrgName(orgName), studyVersion)

    // The header cannot tell an element that renders nothing from one that does, so ARCHIVED (no
    // banner copy) must pass nothing at all.
    const banner = bannerCopy ? <StatusBanner copy={bannerCopy} study={study} entries={entries} /> : null

    return (
        <Stack p="xl" gap="xl">
            <StudyPageHeader study={study} />
            <Stack gap="xxl">
                <ProposalRequest
                    study={study}
                    orgSlug={orgSlug}
                    stepLabel="STEP 2"
                    heading={proposalHeading(studyVersion)}
                    banner={banner}
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
