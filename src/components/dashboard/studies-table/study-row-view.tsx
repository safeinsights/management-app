'use client'

import type { ReactNode } from 'react'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { InfoTooltip } from '@/components/tooltip'
import type { StatusLabel } from '@/lib/status-labels'
import { TableTd, TableTr, Text, useMantineTheme } from '@mantine/core'
import dayjs from 'dayjs'
import { Audience, Scope, StudyRow as StudyRowType } from './types'

// Presentational row. Renders from props only — no session/data hooks and no import
// of StudyActionLink (which reads the Clerk session) — so it renders in isolation
// (e.g. Ladle). The StudyRow container (./study-row) computes status and injects the
// real action link.
export type StudyRowViewProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    status: StatusLabel
    isHighlighted: boolean
    actionLink: ReactNode
}

export function StudyRowView({ study, audience, scope, status, isHighlighted, actionLink }: StudyRowViewProps) {
    const theme = useMantineTheme()
    const highlightStyle = isHighlighted ? { backgroundColor: `${theme.colors.navy[0]}80`, fontWeight: 600 } : undefined

    // Get the "Submitted To" value (researcher only)
    const submittedTo = study.reviewingEnclaveName || study.orgName || ''

    // Get the "Submitted By" value (reviewer only)
    const submittedBy = study.createdBy

    const reviewedByOrOrg = scope === 'org' ? (study.reviewerName ?? '-') : study.orgName

    return (
        <TableTr fz={14} style={highlightStyle}>
            {/* Study Name - common to all */}
            <TableTd>
                <InfoTooltip label={study.title} multiline maw={400}>
                    <Text
                        lineClamp={2}
                        style={{ cursor: 'pointer', overflowWrap: 'break-word' }}
                        size="sm"
                        fw={isHighlighted ? 600 : undefined}
                    >
                        {study.title}
                    </Text>
                </InfoTooltip>
            </TableTd>

            {/* Last updated - common to all */}
            <TableTd>{dayjs(study.lastUpdatedAt).format('MMM DD, YYYY')}</TableTd>

            {/* Third column differs by audience */}
            {audience === 'researcher' ? <TableTd>{submittedTo}</TableTd> : <TableTd>{submittedBy}</TableTd>}

            {/* Fourth column - reviewer only has this extra column */}
            {audience === 'reviewer' && <TableTd>{reviewedByOrOrg}</TableTd>}

            {/* Status - common to all */}
            <TableTd>
                <DisplayStudyStatus status={status} />
            </TableTd>

            {/* Action Link - common to all */}
            <TableTd ta="center">{actionLink}</TableTd>
        </TableTr>
    )
}
