'use client'

import type { ReactNode } from 'react'
import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { InfoTooltip } from '@/components/tooltip'
import type { StatusLabel } from '@/lib/status-labels'
import { TableTd, TableTr, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { Audience, Scope, StudyRow as StudyRowType } from './types'
import classes from './study-row-view.module.css'

// Props only, with no import of the Clerk-coupled StudyActionLink, so it renders in isolation.
export type StudyRowViewProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    status: StatusLabel
    isHighlighted: boolean
    actionLink: ReactNode
}

export function StudyRowView({ study, audience, scope, status, isHighlighted, actionLink }: StudyRowViewProps) {
    const submittedTo = study.reviewingEnclaveName || study.orgName || ''

    const submittedBy = study.createdBy

    const reviewedByOrOrg = scope === 'org' ? (study.reviewerName ?? '-') : study.orgName

    return (
        <TableTr fz={14} className={classes.row} mod={{ highlighted: isHighlighted }}>
            <TableTd>
                <InfoTooltip label={study.title} multiline maw={400}>
                    <Text lineClamp={2} style={{ cursor: 'pointer', overflowWrap: 'break-word' }} size="sm">
                        {study.title}
                    </Text>
                </InfoTooltip>
            </TableTd>

            <TableTd>{dayjs(study.lastUpdatedAt).format('MMM DD, YYYY')}</TableTd>

            {audience === 'researcher' ? <TableTd>{submittedTo}</TableTd> : <TableTd>{submittedBy}</TableTd>}

            {audience === 'reviewer' && <TableTd>{reviewedByOrOrg}</TableTd>}

            <TableTd>
                <DisplayStudyStatus status={status} />
            </TableTd>

            <TableTd ta="center">{actionLink}</TableTd>
        </TableTr>
    )
}
