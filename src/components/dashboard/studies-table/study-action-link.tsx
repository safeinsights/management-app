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
        return (
            <Link
                href={Routes.studyAgreements({ orgSlug: labSlug, studyId: study.id })}
                aria-label={`View details for study ${study.title}`}
                fw={isHighlighted ? 600 : undefined}
            >
                View
            </Link>
        )
    }

    // Reviewer goes through agreements before the review page
    return (
        <Link
            href={Routes.studyAgreements({ orgSlug: slug, studyId: study.id })}
            c="blue.7"
            fw={isHighlighted ? 600 : undefined}
        >
            View
        </Link>
    )
}
