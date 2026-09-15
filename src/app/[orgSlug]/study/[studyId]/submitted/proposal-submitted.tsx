'use client'

import { Stack } from '@mantine/core'
import { displayOrgName } from '@/lib/string'
import { ErrorAlert } from '@/components/errors'
import { StudyAgreementPreparingNotice } from '@/components/legal/study-agreement-preparing-notice'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { StepNavigation } from '@/components/study/step-navigation'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { StudyStatus } from '@/database/types'
import type { Submitted } from '@/schema/study'
import { StudyPageHeader } from '@/components/study/study-page-header'
import type { StepNav } from '@/lib/study-screen'
import { effectiveProposalStatus } from '@/lib/review-decision'
import { decisionTimestampForProposalHeader } from '@/lib/studies'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { researcherProposalBanner, type BannerCopy } from '@/lib/study-banners'

interface ProposalSubmittedProps {
    orgSlug: string
    study: Submitted<SelectedStudy>
    orgName: string
    entries: ProposalFeedbackEntry[]
    studyVersion: number
    feedbackError?: boolean
    // Resolved by the route from the researcher nav table (OTTER-673).
    nav: StepNav
}

function proposalHeading(studyVersion: number): string {
    if (studyVersion <= 1) return 'Initial request'
    return `Initial request ${studyVersion}.0`
}

function StatusBanner({
    copy,
    study,
    entries,
}: {
    copy: BannerCopy
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
    nav,
}: ProposalSubmittedProps) {
    const proposalStatus = effectiveProposalStatus(study)
    const bannerCopy = researcherProposalBanner(proposalStatus, {
        dataPartner: displayOrgName(orgName),
        version: studyVersion,
    })

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
                    initialExpanded={false}
                />
                <StudyAgreementPreparingNotice studyId={study.id} isVisible={proposalStatus === 'APPROVED'} />
                <FeedbackErrorAlert status={proposalStatus} feedbackError={feedbackError} />
                <FeedbackAndNotesSection entries={entries} />
                <StepNavigation nav={nav} />
            </Stack>
        </Stack>
    )
}
