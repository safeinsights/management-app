import { fontWeight, semanticColor } from '@/theme/tokens'
import { Group } from '@mantine/core'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { useSession } from '@/hooks/session'
import { Audience, StudyRow } from './types'
import { DeleteDraftButton } from './delete-draft-button'
import { resolveDashboardAction } from '@/lib/study-screen'
import { rowStudyState } from './dashboard-raw-state'

type StudyActionLinkProps = {
    study: StudyRow
    audience: Audience
    orgSlug: string
    isHighlighted: boolean
}

function ResearcherLink({
    study,
    orgSlug,
    isHighlighted,
}: {
    study: StudyRow
    orgSlug: string
    isHighlighted: boolean
}) {
    const { session } = useSession()
    const labSlug = study.submittedByOrgSlug || orgSlug
    const action = resolveDashboardAction('researcher', rowStudyState(study), {
        orgSlug: labSlug,
        studyId: study.id,
    })

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
        <Link
            href={action.href}
            aria-label={`View details for study ${study.title}`}
            fw={isHighlighted ? fontWeight.semibold : undefined}
        >
            {action.label}
        </Link>
    )
}

function ReviewerLink({ study, orgSlug, isHighlighted }: { study: StudyRow; orgSlug: string; isHighlighted: boolean }) {
    const slug = study.orgSlug || orgSlug
    const href = Routes.studyReview({ orgSlug: slug, studyId: study.id })

    return (
        <Link href={href} c={semanticColor('link.default')} fw={isHighlighted ? fontWeight.semibold : undefined}>
            View
        </Link>
    )
}

export function StudyActionLink({ study, audience, orgSlug, isHighlighted }: StudyActionLinkProps) {
    if (audience === 'researcher') {
        return <ResearcherLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} />
    }

    return <ReviewerLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} />
}
