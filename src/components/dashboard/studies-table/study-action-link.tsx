import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { Audience, StudyRow } from './types'

type StudyActionLinkProps = {
    study: StudyRow
    audience: Audience
    orgSlug: string
    isHighlighted: boolean
}

export function StudyActionLink({ study, audience, orgSlug, isHighlighted }: StudyActionLinkProps) {
    // Use study.orgSlug for user scope tables, otherwise use the prop
    const slug = study.orgSlug || orgSlug

    if (audience === 'researcher') {
        // Researchers always access studies via their lab's org slug
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
        const href =
            study.status === 'APPROVED'
                ? Routes.studyAgreements({ orgSlug: labSlug, studyId: study.id })
                : Routes.studyView({ orgSlug: labSlug, studyId: study.id })
        return (
            <Link href={href} aria-label={`View details for study ${study.title}`} fw={isHighlighted ? 600 : undefined}>
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
