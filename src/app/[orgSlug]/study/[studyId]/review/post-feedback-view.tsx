'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import type { ReviewDecision, StudyJobFileType } from '@/database/types'
import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import { ProposalRequest } from '@/components/study/proposal-initial-request'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import { Routes } from '@/lib/routes'
import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import type { CodeReviewFeedbackEntry, ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { StudyCodeViewer, type CodeFile } from './submitted-code-interactive'

export type PostFeedbackKind = 'PROPOSAL' | 'CODE'

type PostFeedbackViewProps = {
    orgSlug: string
    study: SelectedStudy
    entries: ProposalFeedbackEntry[] | CodeReviewFeedbackEntry[]
    kind?: PostFeedbackKind
    job?: LatestJobForStudy | null
}

type DecisionCopy = {
    timestampLabel: string
    banner: { bg: string; testId: string; copy: string }
}

type KindCopy = {
    heading: string
    crumbLast: string
    stepLabel: string
    decisionCopy: Partial<Record<ReviewDecision, DecisionCopy>>
}

const PROPOSAL_DECISION_COPY: Record<ReviewDecision, DecisionCopy> = {
    APPROVE: {
        timestampLabel: 'Approved on',
        banner: {
            bg: 'green.1',
            testId: 'decision-banner-approved',
            copy: "This initial request has been approved. You'll receive email notifications when the researcher proceeds to the next step.",
        },
    },
    'NEEDS-CLARIFICATION': {
        timestampLabel: 'Clarification requested on',
        banner: {
            bg: 'yellow.1',
            testId: 'decision-banner-clarification',
            copy: 'You have requested clarification. The researcher has been notified, and we will inform you once they resubmit.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected on',
        banner: {
            bg: 'red.1',
            testId: 'decision-banner-rejected',
            copy: 'This initial request has been rejected. No further action is required at this time.',
        },
    },
}

const CODE_DECISION_COPY: Partial<Record<ReviewDecision, DecisionCopy>> = {
    APPROVE: {
        timestampLabel: 'Approved on',
        banner: {
            bg: 'green.1',
            testId: 'decision-banner-code-approved',
            copy: 'This study code has been approved. You will be notified when the study results are available for review.',
        },
    },
    'NEEDS-CLARIFICATION': {
        timestampLabel: 'Change requested on',
        banner: {
            bg: 'yellow.1',
            testId: 'decision-banner-code-change-requested',
            copy: 'You have requested changes or more information about the study code. The researcher has been notified, and you will be notified once they resubmit.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected on',
        banner: {
            bg: 'red.1',
            testId: 'decision-banner-code-rejected',
            copy: 'This study code was rejected and the study was ended. No further action is required at this time.',
        },
    },
}

const COPY_BY_KIND: Record<PostFeedbackKind, KindCopy> = {
    PROPOSAL: {
        heading: 'Review initial request',
        crumbLast: 'Review initial request',
        stepLabel: 'STEP 1',
        decisionCopy: PROPOSAL_DECISION_COPY,
    },
    CODE: {
        heading: 'Review study code',
        crumbLast: 'Review study code',
        stepLabel: 'STEP 3',
        decisionCopy: CODE_DECISION_COPY,
    },
}

const CODE_FILE_TYPES: StudyJobFileType[] = ['MAIN-CODE', 'SUPPLEMENTAL-CODE']

function filterAndOrderCodeFiles(files: LatestJobForStudy['files']): CodeFile[] {
    const codeFiles = files.filter((f) => CODE_FILE_TYPES.includes(f.fileType))
    const main = codeFiles.filter((f) => f.fileType === 'MAIN-CODE')
    const supplemental = codeFiles
        .filter((f) => f.fileType === 'SUPPLEMENTAL-CODE')
        .sort((a, b) => a.name.localeCompare(b.name))
    return [...main, ...supplemental].map((f) => ({ name: f.name, fileType: f.fileType }))
}

function DecisionBanner({ decision, kind }: { decision: ReviewDecision; kind: PostFeedbackKind }) {
    const copy = COPY_BY_KIND[kind].decisionCopy[decision]
    if (!copy) return null
    const { banner } = copy
    return (
        <Box bg={banner.bg} p="md" bdrs="sm" my="md" data-testid={banner.testId}>
            <Text c="charcoal.9" size="sm">
                {banner.copy}
            </Text>
        </Box>
    )
}

function GoToDashboardButton() {
    const router = useRouter()
    const handleClick = () => router.push(Routes.dashboard)
    return (
        <Button onClick={handleClick} data-testid="go-to-dashboard">
            Go to dashboard
        </Button>
    )
}

type CodePostFeedbackCardProps = {
    study: SelectedStudy
    job: LatestJobForStudy | null
    stepLabel: string
    heading: string
    timestampLabel: string
    timestampDate: Date
    banner: ReactNode
}

function CodeViewer({ job }: { job: LatestJobForStudy | null }) {
    if (!job) return null
    const codeFiles = filterAndOrderCodeFiles(job.files)
    return <StudyCodeViewer studyJobId={job.id} files={codeFiles} initialExpanded={false} />
}

function CodePostFeedbackCard({
    study,
    job,
    stepLabel,
    heading,
    timestampLabel,
    timestampDate,
    banner,
}: CodePostFeedbackCardProps) {
    return (
        <ProposalStepHeader
            stepLabel={stepLabel}
            heading={heading}
            studyTitle={study.title}
            timestampDate={timestampDate}
            timestampLabel={timestampLabel}
            banner={banner}
        >
            <CodeViewer job={job} />
        </ProposalStepHeader>
    )
}

type SectionProps = {
    isVisible: boolean
    study: SelectedStudy
    job: LatestJobForStudy | null
    orgSlug: string
    kindCopy: KindCopy
    kind: PostFeedbackKind
    entries: ProposalFeedbackEntry[] | CodeReviewFeedbackEntry[]
    timestampLabel: string
    timestampDate: Date
    banner: ReactNode
}

function CodeSection({ isVisible, study, job, kindCopy, timestampLabel, timestampDate, banner }: SectionProps) {
    if (!isVisible) return null
    return (
        <CodePostFeedbackCard
            study={study}
            job={job}
            stepLabel={kindCopy.stepLabel}
            heading={kindCopy.heading}
            timestampLabel={timestampLabel}
            timestampDate={timestampDate}
            banner={banner}
        />
    )
}

function ProposalSection({ isVisible, study, orgSlug, kindCopy, kind, entries, timestampLabel, banner }: SectionProps) {
    if (!isVisible) return null
    return (
        <ProposalRequest
            study={study}
            orgSlug={orgSlug}
            stepLabel={kindCopy.stepLabel}
            heading={kindCopy.heading}
            statusBadge={timestampLabel}
            entries={kind === 'PROPOSAL' ? (entries as ProposalFeedbackEntry[]) : []}
            banner={banner}
            initialExpanded={false}
        />
    )
}

function buildCrumbs({
    orgSlug,
    studyId,
    kind,
    crumbLast,
}: {
    orgSlug: string
    studyId: string
    kind: PostFeedbackKind
    crumbLast: string
}): Array<[string, string?]> {
    const dashboard: [string, string] = ['Dashboard', Routes.orgDashboard({ orgSlug })]
    const proposalCrumb: [string, string?] =
        kind === 'CODE' ? ['Study proposal', Routes.studySubmitted({ orgSlug, studyId })] : ['Study proposal']
    const current: [string] = [crumbLast]
    return [dashboard, proposalCrumb, current]
}

export function PostFeedbackView({ orgSlug, study, entries, kind = 'PROPOSAL', job = null }: PostFeedbackViewProps) {
    const latest = entries[0]
    if (!latest || latest.decision === null) {
        return null
    }

    const decision = latest.decision
    const kindCopy = COPY_BY_KIND[kind]
    const decisionCopy = kindCopy.decisionCopy[decision]
    const timestampLabel = decisionCopy?.timestampLabel ?? PROPOSAL_DECISION_COPY[decision].timestampLabel
    const crumbs = buildCrumbs({ orgSlug, studyId: study.id, kind, crumbLast: kindCopy.crumbLast })
    const banner = <DecisionBanner decision={decision} kind={kind} />
    const showCodeCard = kind === 'CODE'
    const sectionProps: SectionProps = {
        isVisible: false,
        study,
        job,
        orgSlug,
        kindCopy,
        kind,
        entries,
        timestampLabel,
        timestampDate: latest.createdAt,
        banner,
    }

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs crumbs={crumbs} />
                <Title order={1} fz={40} fw={700}>
                    Study proposal
                </Title>
                <CodeSection {...sectionProps} isVisible={showCodeCard} />
                <ProposalSection {...sectionProps} isVisible={!showCodeCard} />
                <FeedbackAndNotesSection entries={entries} />
                <Group justify="flex-end">
                    <GoToDashboardButton />
                </Group>
            </Stack>
        </Box>
    )
}
