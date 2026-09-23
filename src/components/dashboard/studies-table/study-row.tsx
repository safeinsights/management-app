import { resolvePillStatus, resolveRowHighlight } from '@/lib/study-screen'
import { StudyActionLink } from './study-action-link'
import { Audience, Scope, StudyRow as StudyRowType } from './types'
import { rowStudyState } from './dashboard-raw-state'
import { pillOrgNamesFromRow } from './pill-context'
import { StudyRowView } from './study-row-view'

type StudyRowProps = {
    study: StudyRowType
    audience: Audience
    scope: Scope
    orgSlug: string
}

function rowPresentation(study: StudyRowType, audience: Audience) {
    const state = rowStudyState(study)
    return {
        status: resolvePillStatus(audience, state, pillOrgNamesFromRow(study)),
        isHighlighted: resolveRowHighlight(audience, state),
    }
}

export function StudyRow({ study, audience, scope, orgSlug }: StudyRowProps) {
    const { status, isHighlighted } = rowPresentation(study, audience)

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
