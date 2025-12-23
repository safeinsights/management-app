import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { InfoTooltip } from '@/components/tooltip'
import { useStudyStatus } from '@/hooks/use-study-status'
import { TableTd, TableTr, Text, useMantineTheme } from '@mantine/core'
import dayjs from 'dayjs'
import { StudyActionLink } from './study-action-link'
import { Audience, Scope, StudyRow as StudyRowType } from './types'

type StudyRowProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    orgSlug: string
}

function shouldHighlight(study: StudyRowType, audience: Audience): boolean {
    if (audience === 'researcher') {
        return study.jobStatusChanges.some((c) => c.status === 'FILES-APPROVED')
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
                <InfoTooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }} size="sm" fw={isHighlighted ? 600 : undefined}>
                        {study.title}
                    </Text>
                </InfoTooltip>
            </TableTd>

            {/* Submitted On - common to all */}
            <TableTd>{dayjs(study.createdAt).format('MMM DD, YYYY')}</TableTd>

            {/* Third column differs by audience */}
            {audience === 'researcher' ? <TableTd>{submittedTo}</TableTd> : <TableTd>{submittedBy}</TableTd>}

            {/* Fourth column - reviewer only has this extra column */}
            {audience === 'reviewer' && <TableTd>{reviewedByOrOrg}</TableTd>}

            {/* Stage - common to all */}
            <TableTd>{status.stage}</TableTd>

            {/* Status - common to all, but researcher passes isResearchLabDashboard */}
            <TableTd>
                <DisplayStudyStatus status={status} isResearchLabDashboard={audience === 'researcher'} />
            </TableTd>

            {/* Action Link - common to all */}
            <TableTd ta="center">
                <StudyActionLink study={study} audience={audience} orgSlug={orgSlug} isHighlighted={isHighlighted} />
            </TableTd>
        </TableTr>
    )
}
