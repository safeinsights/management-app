import { useStudyStatus } from '@/hooks/use-study-status'
import { StudyActionLink } from './study-action-link'
import { studyHasJobStatus } from '@/lib/studies'
import { latestCodeChangeIsSubmission } from '@/lib/study-job-status'
import { Audience, Scope, StudyRow as StudyRowType } from './types'
import { StudyRowView } from './study-row-view'

type StudyRowProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    orgSlug: string
}

// A reviewer's row is highlighted when something needs their attention: the proposal awaiting
// review (study.status PENDING-REVIEW) OR code awaiting review on the latest job. The code case
// can't key on study.status — after a code change-request the study stays APPROVED (proposal-
// stage) while the resubmitted code sits at CODE-SUBMITTED/CODE-SCANNED, exactly the state that
// must still flag the reviewer (OTTER-552).
function shouldHighlight(study: StudyRowType, audience: Audience): boolean {
    if (audience === 'researcher') {
        return studyHasJobStatus(study, 'FILES-APPROVED')
    }
    return study.status === 'PENDING-REVIEW' || latestCodeChangeIsSubmission(study.jobStatusChanges)
}

export function StudyRow({ study, audience, scope, orgSlug }: StudyRowProps) {
    const status = useStudyStatus({
        studyStatus: study.status,
        audience,
        jobStatusChanges: study.jobStatusChanges,
    })

    const isHighlighted = shouldHighlight(study, audience)

    return (
        <StudyRowView
            study={study}
            audience={audience}
            scope={scope}
            status={status}
            isHighlighted={isHighlighted}
            actionLink={
                <StudyActionLink
                    study={study}
                    audience={audience}
                    scope={scope}
                    orgSlug={orgSlug}
                    isHighlighted={isHighlighted}
                />
            }
        />
    )
}
