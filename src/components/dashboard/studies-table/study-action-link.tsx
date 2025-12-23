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
        if (study.status === 'DRAFT') {
            return (
                <Link
                    href={Routes.studyEdit({ orgSlug: slug, studyId: study.id })}
                    aria-label={`Edit draft study ${study.title}`}
                >
                    Edit
                </Link>
            )
        }
        return (
            <Link
                href={Routes.studyView({ orgSlug: slug, studyId: study.id })}
                aria-label={`View details for study ${study.title}`}
                fw={isHighlighted ? 600 : undefined}
            >
                View
            </Link>
        )
    }

    // Reviewer always goes to studyReview
    return (
        <Link
            href={Routes.studyReview({ orgSlug: slug, studyId: study.id })}
            c="blue.7"
            fw={isHighlighted ? 600 : undefined}
        >
            View
        </Link>
    )
}
