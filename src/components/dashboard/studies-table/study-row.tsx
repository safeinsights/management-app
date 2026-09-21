import { useStudyStatus } from '@/hooks/use-study-status'
import { displayOrgName } from '@/lib/string'
import { projectStudyState, resolveRowHighlight, type PillOrgNames } from '@/lib/study-screen'
import { StudyActionLink } from './study-action-link'
import { Audience, Scope, StudyRow as StudyRowType } from './types'
import { dashboardRawStateFromRow } from './dashboard-raw-state'
import { StudyRowView } from './study-row-view'

type StudyRowProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    orgSlug: string
}

function shouldHighlight(study: StudyRowType, audience: Audience): boolean {
    return resolveRowHighlight(audience, projectStudyState(dashboardRawStateFromRow(study)))
}

// Tooltips name the other side of the study. Neither name is guaranteed on a dashboard row, so both
// fall back to a role noun rather than rendering an empty gap mid-sentence.
function pillOrgNames(study: StudyRowType): PillOrgNames {
    return {
        dataPartner: displayOrgName(study.reviewingEnclaveName || study.orgName || '') || 'the data partner',
        researchLab: displayOrgName(study.submittingLabName || '') || 'the research lab',
    }
}

export function StudyRow({ study, audience, scope, orgSlug }: StudyRowProps) {
    const status = useStudyStatus({
        studyStatus: study.status,
        audience,
        jobStatusChanges: study.jobStatusChanges,
        outputsViewedAt: study.outputsViewedAt,
        names: pillOrgNames(study),
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
