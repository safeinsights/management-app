import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Audience, StudyRow } from './types'
import { useStudyHref } from '@/hooks/use-study-href'

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
    const labSlug = study.submittedByOrgSlug || orgSlug
    const hasJobActivity = study.jobStatusChanges.length > 0
    const studyParams = { orgSlug: labSlug, studyId: study.id }
    const href = useStudyHref(study.status, hasJobActivity, studyParams)

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

    return (
        <Link href={href} aria-label={`View details for study ${study.title}`} fw={isHighlighted ? 600 : undefined}>
            View
        </Link>
    )
}

function ReviewerLink({ study, orgSlug, isHighlighted }: { study: StudyRow; orgSlug: string; isHighlighted: boolean }) {
    const slug = study.orgSlug || orgSlug
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

export function StudyActionLink({ study, audience, orgSlug, isHighlighted }: StudyActionLinkProps) {
    if (audience === 'researcher') {
        return <ResearcherLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} />
    }

    return <ReviewerLink study={study} orgSlug={orgSlug} isHighlighted={isHighlighted} />
}
