import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { InfoTooltip } from '@/components/tooltip'
import { useStudyStatus } from '@/hooks/use-study-status'
import { Box, TableTd, TableTr, Text, useMantineTheme } from '@mantine/core'
import dayjs from 'dayjs'
import { StudyActionLink } from './study-action-link'
import { Audience, Scope, StudyRow as StudyRowType } from './types'

type StudyRowProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    orgSlug: string
}

export function StudyRow({ study, audience, scope, orgSlug }: StudyRowProps) {
    const theme = useMantineTheme()
    const status = useStudyStatus({
        studyStatus: study.status,
        audience,
        jobStatusChanges: study.jobStatusChanges,
    })

    const isHighlighted = study.needsAttention === true
    const highlightStyle = isHighlighted
        ? { backgroundColor: `${theme.colors.purple[0]}80`, fontWeight: 600 }
        : undefined

    const submittedTo = study.reviewingEnclaveName || study.orgName || ''
    const submittedBy = scope === 'org' ? study.submittingLabName : study.createdBy
    const reviewedByOrOrg = scope === 'org' ? orgSlug : study.orgName

    return (
        <TableTr fz={14} style={highlightStyle}>
            <TableTd w={16} p={0} pl={4}>
                {isHighlighted && <Box w={8} h={8} bg="red" style={{ borderRadius: '50%' }} />}
            </TableTd>

            <TableTd>
                <InfoTooltip label={study.title}>
                    <Text lineClamp={2} style={{ cursor: 'pointer' }} size="sm" fw={isHighlighted ? 600 : undefined}>
                        {study.title}
                    </Text>
                </InfoTooltip>
            </TableTd>

            <TableTd>{study.status !== 'DRAFT' ? dayjs(study.createdAt).format('MMM DD, YYYY') : '-'}</TableTd>

            {audience === 'researcher' ? <TableTd>{submittedTo}</TableTd> : <TableTd>{submittedBy}</TableTd>}

            {audience === 'reviewer' && <TableTd>{reviewedByOrOrg}</TableTd>}

            <TableTd>
                <DisplayStudyStatus status={status} />
            </TableTd>

            <TableTd ta="center">
                <StudyActionLink study={study} audience={audience} orgSlug={orgSlug} isHighlighted={isHighlighted} />
            </TableTd>
        </TableTr>
    )
}
