'use client'

import { Box, Collapse } from '@mantine/core'
import { useCallback, useRef, type ReactNode } from 'react'
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

type CodeReviewSubmittedCodeProps = {
    orgSlug: string
    study: Submitted<SelectedStudy>
    job: LatestJobForStudy
    review: StudyReviewWithMeta | null
    scan: JobScanResult
    heading: string
    submittedAt: Date | string
    timestampLabel: string
    banner: ReactNode
    initiallyExpanded: boolean
}

export function CodeReviewSubmittedCode({
    orgSlug,
    study,
    job,
    review,
    scan,
    heading,
    submittedAt,
    timestampLabel,
    banner,
    initiallyExpanded,
}: CodeReviewSubmittedCodeProps) {
    const { expanded, toggle, collapse } = useExpandable(initiallyExpanded)
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

    return (
        <>
            <ProposalStepHeader
                stepLabel="STEP 3"
                heading={heading}
                studyTitle={study.title}
                timestampDate={submittedAt}
                timestampLabel={timestampLabel}
                banner={banner}
            >
                <StudyCodeToggle
                    ref={openerRef}
                    isVisible={!expanded}
                    expanded={false}
                    onClick={onExpand}
                    labels={FULL_STUDY_CODE_TOGGLE_LABELS}
                />
            </ProposalStepHeader>
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
        </>
    )
}
