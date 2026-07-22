'use client'

import { Box, Collapse } from '@mantine/core'
import { useCallback, useRef, type ReactNode, type RefObject } from 'react'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import {
    FULL_STUDY_CODE_TOGGLE_LABELS,
    StudyCodeToggle,
    useExpandable,
} from '@/app/[orgSlug]/study/[studyId]/view/study-code-collapse'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { JobScanResult, LatestJobForStudy, StudyReviewWithMeta } from '@/server/db/queries'
import type { Submitted } from '@/schema/study'
import { SubmittedCodeSection } from './submitted-code-section'

type CollapsibleSubmittedCodeSectionProps = {
    isVisible?: boolean
    orgSlug: string
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy | null
    review: StudyReviewWithMeta | null
    scan: JobScanResult | null
    stepLabel: string
    heading: string
    timestampDate: Date | string | null
    timestampLabel: string
    banner: ReactNode
    initiallyExpanded?: boolean
}

type SubmittedCodePanelProps = Pick<
    CollapsibleSubmittedCodeSectionProps,
    'orgSlug' | 'study' | 'job' | 'review' | 'scan'
> & {
    isVisible: boolean
    expanded: boolean
    onCollapse: () => void
    panelRef: RefObject<HTMLDivElement | null>
}

function SubmittedCodePanel({
    isVisible,
    orgSlug,
    study,
    job,
    review,
    scan,
    expanded,
    onCollapse,
    panelRef,
}: SubmittedCodePanelProps) {
    // Callers fetch the job and scan together, and jobScanResultForJob always returns a scan fallback.
    // The scan check narrows its type and only rejects the same missing-job state in practice.
    if (!isVisible || !job || !scan) return null
    return (
        <Collapse in={expanded} keepMounted>
            <Box ref={panelRef} tabIndex={-1}>
                <SubmittedCodeSection
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    review={review}
                    scan={scan}
                    onCollapse={onCollapse}
                />
            </Box>
        </Collapse>
    )
}

export function CollapsibleSubmittedCodeSection({
    isVisible = true,
    orgSlug,
    study,
    job,
    review,
    scan,
    stepLabel,
    heading,
    timestampDate,
    timestampLabel,
    banner,
    initiallyExpanded = false,
}: CollapsibleSubmittedCodeSectionProps) {
    // Without a panel, an opener would expand to an empty card with no way to collapse it again.
    const hasSubmittedCode = Boolean(job && scan)
    const { expanded, toggle, collapse } = useExpandable(initiallyExpanded && hasSubmittedCode)
    const openerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const onCollapse = useCallback(() => {
        collapse()
        requestAnimationFrame(() => openerRef.current?.focus())
    }, [collapse])
    const onExpand = useCallback(() => {
        toggle()
        requestAnimationFrame(() => panelRef.current?.focus())
    }, [toggle])
    if (!isVisible) return null

    return (
        <>
            <ProposalStepHeader
                stepLabel={stepLabel}
                heading={heading}
                studyTitle={study.title}
                timestampDate={timestampDate}
                timestampLabel={timestampLabel}
                banner={banner}
            >
                <StudyCodeToggle
                    ref={openerRef}
                    isVisible={!expanded && hasSubmittedCode}
                    expanded={false}
                    onClick={onExpand}
                    labels={FULL_STUDY_CODE_TOGGLE_LABELS}
                />
            </ProposalStepHeader>
            <SubmittedCodePanel
                isVisible={hasSubmittedCode}
                orgSlug={orgSlug}
                study={study}
                job={job}
                review={review}
                scan={scan}
                expanded={expanded}
                onCollapse={onCollapse}
                panelRef={panelRef}
            />
        </>
    )
}
