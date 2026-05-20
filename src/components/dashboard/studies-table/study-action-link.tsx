import { Group } from '@mantine/core'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { usePostSubmissionFeatureFlag } from '@/components/openstax-feature-flag'
import { useSession } from '@/hooks/session'
import { Audience, Scope, StudyRow } from './types'
import { useStudyHref } from '@/hooks/use-study-href'
import { DeleteDraftButton } from './delete-draft-button'

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
    const isPostSubmissionFlow = usePostSubmissionFeatureFlag()
    const labSlug = study.submittedByOrgSlug || orgSlug
    const hasJobActivity = study.jobStatusChanges.length > 0
    const studyParams = { orgSlug: labSlug, studyId: study.id }
    const jobStatuses = study.jobStatusChanges.map((c) => c.status)
    const baseHref = useStudyHref(study.status, hasJobActivity, studyParams, jobStatuses, isPostSubmissionFlow)
    const href = scope === 'org' ? (`${baseHref}?returnTo=org` as typeof baseHref) : baseHref

    if (study.status === 'DRAFT') {
        const isAuthor = session?.user.id === study.researcherId
        return (
            <Group gap="xs" justify="center" wrap="nowrap">
                <Link
                    href={Routes.studyEdit({ orgSlug: labSlug, studyId: study.id })}
                    aria-label={`Edit draft study ${study.title}`}
                >
                    Edit
                </Link>
                {isAuthor && <DeleteDraftButton study={study} />}
            </Group>
        )
    }

    return (
        <Link href={href} aria-label={`View details for study ${study.title}`} fw={isHighlighted ? 600 : undefined}>
            View
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
