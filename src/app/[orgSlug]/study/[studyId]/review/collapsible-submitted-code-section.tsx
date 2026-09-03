'use client'

import { Box, Collapse } from '@mantine/core'
import { useCallback, useRef, type ReactNode, type RefObject } from 'react'
import { ProposalStepHeader } from '@/components/study/proposal-step-header'
import {
    FULL_STUDY_CODE_TOGGLE_LABELS,
    StudyCodeToggle,
} from '@/app/[orgSlug]/study/[studyId]/view/study-code-collapse'
import { useExpandable } from '@/hooks/use-expandable'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { JobAnalysis, LatestJobForStudy } from '@/server/db/queries'
import type { Submitted } from '@/schema/study'
import { SubmittedCodeSection } from './submitted-code-section'

type CollapsibleSubmittedCodeSectionProps = {
    isVisible?: boolean
    orgSlug: string
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy | null
    analysis: JobAnalysis | null
    stepLabel: string
    heading: string
    timestampDate: Date | string | null
    timestampLabel: string
    banner: ReactNode
    initiallyExpanded?: boolean
}

type SubmittedCodePanelProps = Pick<CollapsibleSubmittedCodeSectionProps, 'orgSlug' | 'study' | 'job' | 'analysis'> & {
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
    analysis,
    expanded,
    onCollapse,
    panelRef,
}: SubmittedCodePanelProps) {
    // The analysis check only narrows its type: it is non-null whenever the job is.
    if (!isVisible || !job || !analysis) return null
    return (
        <Collapse in={expanded} keepMounted>
            <Box ref={panelRef} tabIndex={-1}>
                <SubmittedCodeSection
                    orgSlug={orgSlug}
                    study={study}
                    job={job}
                    analysis={analysis}
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
    analysis,
    stepLabel,
    heading,
    timestampDate,
    timestampLabel,
    banner,
    initiallyExpanded = false,
}: CollapsibleSubmittedCodeSectionProps) {
    // Without a panel, an opener would expand an empty card with no way to collapse it again.
    const hasSubmittedCode = Boolean(job && analysis)
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
                analysis={analysis}
                expanded={expanded}
                onCollapse={onCollapse}
                panelRef={panelRef}
            />
        </>
    )
}
