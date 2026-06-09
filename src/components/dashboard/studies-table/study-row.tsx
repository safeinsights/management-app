import { DisplayStudyStatus } from '@/components/study/display-study-status'
import { InfoTooltip } from '@/components/tooltip'
import { useStudyStatus } from '@/hooks/use-study-status'
import { TableTd, TableTr, Text, useMantineTheme } from '@mantine/core'
import dayjs from 'dayjs'
import { StudyActionLink } from './study-action-link'
import { studyHasJobStatus } from '@/lib/studies'
import { isCodeReviewableLatest } from '@/lib/study-job-status'
import { Audience, Scope, StudyRow as StudyRowType } from './types'

type StudyRowProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    orgSlug: string
}

// A reviewer's row is highlighted when something needs their attention. That's the proposal
// awaiting review (study.status PENDING-REVIEW) OR code awaiting review on the latest job. The
// code case can't key on study.status: after a code change-request the study stays APPROVED
// (proposal-stage) while the resubmitted code sits at CODE-SUBMITTED/CODE-SCANNED — exactly the
// state that must still flag the reviewer (OTTER-552).
function codeNeedsReview(study: StudyRowType): boolean {
    return isCodeReviewableLatest(study.jobStatusChanges)
}

function shouldHighlight(study: StudyRowType, audience: Audience): boolean {
    if (audience === 'researcher') {
        return studyHasJobStatus(study, 'FILES-APPROVED')
    }
    return study.status === 'PENDING-REVIEW' || codeNeedsReview(study)
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
