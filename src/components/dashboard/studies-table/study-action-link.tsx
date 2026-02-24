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
            <Link href={Routes.studyEdit({ orgSlug: labSlug, studyId: study.id })} aria-label={`Edit draft study ${study.title}`}>
                Edit
            </Link>
        )
    }

    const href =
        isNewFlow && study.status === 'APPROVED'
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

    if (!isNewFlow) {
        return (
            <Link href={Routes.studyAgreements({ orgSlug: slug, studyId: study.id })} c="blue.7" fw={isHighlighted ? 600 : undefined}>
                View
            </Link>
        )
    }

    // jobStatusChanges is ordered DESC, so index 0 is the most recent
    const latestJobStatus = study.jobStatusChanges.at(0)?.status
    const href =
        latestJobStatus === 'CODE-SUBMITTED'
            ? Routes.studyAgreements({ orgSlug: slug, studyId: study.id })
            : Routes.studyReview({ orgSlug: slug, studyId: study.id })

    return (
        <Link href={href} c="blue.7" fw={isHighlighted ? 600 : undefined}>
            View
        </Link>
    )
}


export function StudyActionLink({ study, audience, orgSlug, isHighlighted }: StudyActionLinkProps) {
    const isNewFlow = useOpenStaxFeatureFlag()
console.log({ isNewFlow })
    if (audience === 'researcher') {
        return <ResearcherLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} isNewFlow={isNewFlow} />
    }

    return <ReviewerLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} isNewFlow={isNewFlow} />
}
