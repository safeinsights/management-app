import { useStudyStatus } from '@/hooks/use-study-status'
import { StudyActionLink } from './study-action-link'
import { studyHasJobStatus } from '@/lib/studies'
import { Audience, Scope, StudyRow as StudyRowType } from './types'
import { StudyRowView } from './study-row-view'

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
