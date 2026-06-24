import { Group } from '@mantine/core'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { useSession } from '@/hooks/session'
import { Audience, Scope, StudyRow } from './types'
import { DeleteDraftButton } from './delete-draft-button'
import { projectStudyState, resolveDashboardAction } from '@/lib/study-screen'
import { dashboardRawStateFromRow } from './dashboard-raw-state'

type StudyActionLinkProps = {
    study: StudyRow
    audience: Audience
    scope: Scope
    orgSlug: string
    isHighlighted: boolean
}

function ResearcherLink({
    study,
    orgSlug,
    scope,
    isHighlighted,
}: {
    study: StudyRow
    orgSlug: string
    scope: Scope
    isHighlighted: boolean
}) {
    const { session } = useSession()
    const labSlug = study.submittedByOrgSlug || orgSlug
    const action = resolveDashboardAction('researcher', projectStudyState(dashboardRawStateFromRow(study)), {
        orgSlug: labSlug,
        studyId: study.id,
    })
    const href = scope === 'org' ? (`${action.href}?returnTo=org` as typeof action.href) : action.href

    if (action.secondaryAction === 'delete-draft') {
        const isAuthor = session?.user.id === study.researcherId
        return (
            <Group gap="xs" justify="center" wrap="nowrap">
                <Link href={action.href} aria-label={`Edit draft study ${study.title}`}>
                    {action.label}
                </Link>
                {isAuthor && <DeleteDraftButton study={study} />}
            </Group>
        )
    }

    return (
        <Link href={href} aria-label={`View details for study ${study.title}`} fw={isHighlighted ? 600 : undefined}>
            {action.label}
        </Link>
    )
}

function ReviewerLink({ study, orgSlug, isHighlighted }: { study: StudyRow; orgSlug: string; isHighlighted: boolean }) {
    const slug = study.orgSlug || orgSlug
    const href = Routes.studyReview({ orgSlug: slug, studyId: study.id })

    return (
        <Link href={href} c="blue.7" fw={isHighlighted ? 600 : undefined}>
            View
        </Link>
    )
}

export function StudyActionLink({ study, audience, scope, orgSlug, isHighlighted }: StudyActionLinkProps) {
    if (audience === 'researcher') {
        return <ResearcherLink study={study} orgSlug={orgSlug} scope={scope} isHighlighted={isHighlighted} />
    }

    return <ReviewerLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} />
}
