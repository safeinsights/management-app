'use client'

import { ButtonLink } from '@/components/links'
import type { ReviewDecision } from '@/database/types'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { Routes } from '@/lib/routes'
import { StatusAlert, statusAlertTitle } from '@/components/study/status-alert'
import { reviewerCodeDecisionBanner, reviewerProposalDecisionBanner } from '@/lib/study-banners'
import { type Submitted } from '@/schema/study'
import { Box, Button, Group, Stack } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
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
    // Set only on the read-only /review/code walk-back step (OTTER-643).
    previousHref?: Route
    // Set only when /review resolves past this screen (OTTER-687); the primary action then reads
    // "Next step" instead of "Go to dashboard".
    nextStepHref?: Route
}

type KindCopy = {
    heading: string
    stepLabel: string
}

const COPY_BY_KIND: Record<PostFeedbackKind, KindCopy> = {
    PROPOSAL: { heading: 'Review initial request', stepLabel: 'STEP 1' },
    CODE: { heading: 'Review study code', stepLabel: 'STEP 3' },
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

function GoToDashboardButton({ isVisible }: { isVisible: boolean }) {
    const router = useRouter()
    const handleClick = () => router.push(Routes.dashboard)
    if (!isVisible) return null
    return (
        <Button onClick={handleClick} data-testid="go-to-dashboard">
            Go to dashboard
        </Button>
    )
}

function NextStepButton({ href }: { href?: Route }) {
    if (!href) return null
    return (
        <ButtonLink href={href} data-testid="cta-next-step">
            Next step
        </ButtonLink>
    )
}

function PreviousButton({ href }: { href?: Route }) {
    const router = useRouter()
    if (!href) return null
    return (
        <Button
            variant="subtle"
            leftSection={<CaretLeftIcon />}
            onClick={() => router.push(href)}
            data-testid="post-feedback-previous"
        >
            Previous
        </Button>
    )
}

type ProposalSectionProps = {
    isVisible: boolean
    study: Submitted<SelectedStudy>
    orgSlug: string
    kindCopy: KindCopy
    banner: ReactNode
}

function ProposalSection({ isVisible, study, orgSlug, kindCopy, banner }: ProposalSectionProps) {
    if (!isVisible) return null
    return (
        <ProposalRequest
            study={study}
            orgSlug={orgSlug}
            stepLabel={kindCopy.stepLabel}
            heading={kindCopy.heading}
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
    previousHref,
    nextStepHref,
}: PostFeedbackViewProps) {
    const latest = entries[0]
    const latestDecision = latest?.decision ?? null
    const decision = latestDecision ?? fallback?.decision ?? null
    if (decision === null) {
        return null
    }

    const kindCopy = COPY_BY_KIND[kind]
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
    // The forward link and the dashboard button are mutually exclusive and both sit right, so the
    // row only splits when there is a left button.
    const buttonRowJustify = previousHref ? 'space-between' : 'flex-end'

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
                    stepLabel={kindCopy.stepLabel}
                    heading={kindCopy.heading}
                    banner={banner}
                />
                <ProposalSection
                    isVisible={!isCode}
                    study={study}
                    orgSlug={orgSlug}
                    kindCopy={kindCopy}
                    banner={banner}
                />
                <FeedbackAndNotesSection entries={entries} alwaysExpandLatest={isCode} />
                <Group justify={buttonRowJustify}>
                    <PreviousButton href={previousHref} />
                    <NextStepButton href={nextStepHref} />
                    <GoToDashboardButton isVisible={!nextStepHref} />
                </Group>
            </Stack>
        </Box>
    )
}
