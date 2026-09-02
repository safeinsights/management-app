import { PageHeader } from '@/components/page-header'
import { displayLabName } from '@/lib/string'

// Every study page shows the submitting Research Lab, so both a researcher and a reviewer of the
// same study read the same eyebrow. Resolved here rather than at each call site so the fallback
// cannot drift between them.
export type StudyHeaderStudy = {
    title: string | null
    submittingLabName: string | null
    submittedByOrgSlug: string
}

export function StudyPageHeader({ study }: { study: StudyHeaderStudy }) {
    const eyebrow = displayLabName(study.submittingLabName, study.submittedByOrgSlug)
    const title = study.title ?? 'Untitled study'

    return <PageHeader eyebrow={eyebrow} title={title} />
}
