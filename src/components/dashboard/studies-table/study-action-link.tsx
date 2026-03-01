import { Link } from '@/components/links'
import { useOpenStaxFeatureFlag } from '@/components/openstax-feature-flag'
import { Routes } from '@/lib/routes'
import { Audience, StudyRow } from './types'

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
    isNewFlow,
}: {
    study: StudyRow
    orgSlug: string
    isHighlighted: boolean
    isNewFlow: boolean
}) {
    const labSlug = study.submittedByOrgSlug || orgSlug

    if (study.status === 'DRAFT') {
        return (
            <Link
                href={Routes.studyEdit({ orgSlug: labSlug, studyId: study.id })}
                aria-label={`Edit draft study ${study.title}`}
            >
                Edit
            </Link>
        )
    }

    const hasJobActivity = study.jobStatusChanges.length > 0
    const href =
        isNewFlow && study.status === 'APPROVED' && !hasJobActivity
            ? Routes.studyAgreements({ orgSlug: labSlug, studyId: study.id })
            : Routes.studyView({ orgSlug: labSlug, studyId: study.id })

    return (
        <Link href={href} aria-label={`View details for study ${study.title}`} fw={isHighlighted ? 600 : undefined}>
            View
        </Link>
    )
}

function ReviewerLink({
    study,
    orgSlug,
    isHighlighted,
    isNewFlow,
}: {
    study: StudyRow
    orgSlug: string
    isHighlighted: boolean
    isNewFlow: boolean
}) {
    const slug = study.orgSlug || orgSlug

    if (isNewFlow) {
        const latestJobStatus = study.jobStatusChanges.at(0)?.status
        const href =
            latestJobStatus === 'CODE-SUBMITTED' || latestJobStatus === 'CODE-SCANNED'
                ? Routes.studyAgreements({ orgSlug: slug, studyId: study.id })
                : Routes.studyReview({ orgSlug: slug, studyId: study.id })

        return (
            <Link href={href} c="blue.7" fw={isHighlighted ? 600 : undefined}>
                View
            </Link>
        )
    }

    const href = Routes.studyReview({ orgSlug: slug, studyId: study.id })

    return (
        <Link href={href} c="blue.7" fw={isHighlighted ? 600 : undefined}>
            View
        </Link>
    )
}

export function StudyActionLink({ study, audience, orgSlug, isHighlighted }: StudyActionLinkProps) {
    const isNewFlow = useOpenStaxFeatureFlag()
    if (audience === 'researcher') {
        return <ResearcherLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} isNewFlow={isNewFlow} />
    }

    return <ReviewerLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} isNewFlow={isNewFlow} />
}
