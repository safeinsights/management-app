import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { InfoTooltip } from '@/components/tooltip'
import { useStudyStatus } from '@/hooks/use-study-status'
import { TableTd, TableTr, Text, useMantineTheme } from '@mantine/core'
import dayjs from 'dayjs'
import { StudyActionLink } from './study-action-link'
import { studyHasJobStatus } from '@/lib/studies'
import { Audience, Scope, StudyRow as StudyRowType } from './types'

type StudyRowProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    orgSlug: string
}

function shouldHighlight(study: StudyRowType, audience: Audience): boolean {
    if (audience === 'researcher') {
        return studyHasJobStatus(study, 'FILES-APPROVED')
    }
    return study.status === 'PENDING-REVIEW'
}

export function StudyRow({ study, audience, scope, orgSlug }: StudyRowProps) {
    const theme = useMantineTheme()
    const status = useStudyStatus({
        studyStatus: study.status,
        audience,
        jobStatusChanges: study.jobStatusChanges,
    })

    const isHighlighted = shouldHighlight(study, audience)
    const highlightStyle = isHighlighted
        ? { backgroundColor: `${theme.colors.purple[0]}80`, fontWeight: 600 }
        : undefined

    // Get the "Submitted To" value (researcher only)
    const submittedTo = study.reviewingEnclaveName || study.orgName || ''

    // Get the "Submitted By" value (reviewer only)
    const submittedBy = scope === 'org' ? study.submittingLabName : study.createdBy

    // Get the "Reviewed By" / "Organization" value (reviewer only)
    const reviewedByOrOrg = scope === 'org' ? orgSlug : study.orgName

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

            {/* Submitted On - common to all */}
            <TableTd>{study.submittedAt ? dayjs(study.submittedAt).format('MMM DD, YYYY') : '-'}</TableTd>

            {/* Third column differs by audience */}
            {audience === 'researcher' ? <TableTd>{submittedTo}</TableTd> : <TableTd>{submittedBy}</TableTd>}

            {/* Fourth column - reviewer only has this extra column */}
            {audience === 'reviewer' && <TableTd>{reviewedByOrOrg}</TableTd>}

            {/* Status - common to all */}
            <TableTd>
                <DisplayStudyStatus status={status} />
            </TableTd>

            {/* Action Link - common to all */}
            <TableTd ta="center">
                <StudyActionLink
                    study={study}
                    audience={audience}
                    scope={scope}
                    orgSlug={orgSlug}
                    isHighlighted={isHighlighted}
                />
            </TableTd>
        </TableTr>
    )
}
