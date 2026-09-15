'use client'

import type { ReviewDecision } from '@/database/types'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { StepNavigation } from '@/components/study/step-navigation'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { codeReviewHeading } from '@/lib/code-review'
import { proposalReviewHeading } from '@/lib/proposal-review'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { reviewerCodeDecisionBanner, reviewerProposalDecisionBanner } from '@/lib/study-banners'
import { type Submitted } from '@/schema/study'
import type { StepNav } from '@/lib/study-screen'
import { Box, Stack } from '@mantine/core'
import type { ReactNode } from 'react'
import type { CodeReviewFeedbackEntry, ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { JobAnalysis, LatestJobForStudy } from '@/server/db/queries'
import { CollapsibleSubmittedCodeSection } from './collapsible-submitted-code-section'

export type PostFeedbackKind = 'PROPOSAL' | 'CODE'

type PostFeedbackViewProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
    entries: ProposalFeedbackEntry[] | CodeReviewFeedbackEntry[]
    kind?: PostFeedbackKind
    job?: LatestJobForStudy | null
    analysis?: JobAnalysis | null
    // Proposal approve/reject can write a CODE-* job status with no code-review comment, so
    // without this the page would blank out.
    fallback?: {
        decision: ReviewDecision
        timestamp: Date | string
    }
    // Resolved by the screen from the reviewer nav table (OTTER-673).
    nav: StepNav
    // Drives the versioned heading so this page matches the editable review page.
    reviewVersion?: number
}

const STEP_LABEL_BY_KIND: Record<PostFeedbackKind, string> = {
    PROPOSAL: 'STEP 1',
    CODE: 'STEP 2',
}

type DecisionBannerProps = {
    kind: PostFeedbackKind
    decision: ReviewDecision
    researchLab: string
    reviewerName?: string | null
    decidedAt: Date | string | null
}

function DecisionBanner({ kind, decision, researchLab, reviewerName, decidedAt }: DecisionBannerProps) {
    const build = kind === 'CODE' ? reviewerCodeDecisionBanner : reviewerProposalDecisionBanner
    const copy = build(decision, { researchLab, reviewerName })

    return (
        <StatusAlert variant={copy.variant} title={statusAlertTitle(copy.title, decidedAt)}>
            {copy.body}
        </StatusAlert>
    )
}

type ProposalSectionProps = {
    isVisible: boolean
    study: Submitted<SelectedStudy>
    orgSlug: string
    stepLabel: string
    heading: string
    banner: ReactNode
}

function ProposalSection({ isVisible, study, orgSlug, stepLabel, heading, banner }: ProposalSectionProps) {
    if (!isVisible) return null
    return (
        <ProposalRequest
            study={study}
            orgSlug={orgSlug}
            stepLabel={stepLabel}
            heading={heading}
            banner={banner}
            initialExpanded={false}
        />
    )
}

export function PostFeedbackView({
    orgSlug,
    study,
    entries,
    kind = 'PROPOSAL',
    job = null,
    analysis = null,
    fallback,
    nav,
    reviewVersion = 1,
}: PostFeedbackViewProps) {
    const latest = entries[0]
    const latestDecision = latest?.decision ?? null
    const decision = latestDecision ?? fallback?.decision ?? null
    if (decision === null) {
        return null
    }

    const stepLabel = STEP_LABEL_BY_KIND[kind]
    const timestampDate = latestDecision ? latest?.createdAt : (fallback?.timestamp ?? null)
    const isCode = kind === 'CODE'
    const banner = (
        <DecisionBanner
            kind={kind}
            decision={decision}
            researchLab={study.submittingLabName ?? study.submittedByOrgSlug}
            reviewerName={latestDecision ? latest?.authorName : null}
            decidedAt={timestampDate}
        />
    )
    const heading = isCode ? codeReviewHeading(reviewVersion) : proposalReviewHeading(reviewVersion)

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xxl" py="xl">
                <StudyPageHeader study={study} />
                <CollapsibleSubmittedCodeSection
                    isVisible={isCode}
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    analysis={analysis}
                    stepLabel={stepLabel}
                    heading={heading}
                    banner={banner}
                />
                <ProposalSection
                    isVisible={!isCode}
                    study={study}
                    orgSlug={orgSlug}
                    stepLabel={stepLabel}
                    heading={heading}
                    banner={banner}
                />
                <FeedbackAndNotesSection entries={entries} alwaysExpandLatest={isCode} />
                <StepNavigation nav={nav} />
            </Stack>
        </Box>
    )
}
