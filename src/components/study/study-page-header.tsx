import { Group } from '@mantine/core'
import { PageHeader } from '@/components/page-header'
import { displayLabName, UNTITLED_STUDY_TITLE } from '@/lib/string'
import { TestStudyLabel } from './test-study-label'

// Every study page shows the submitting Research Lab, so both a researcher and a reviewer of the
// same study read the same eyebrow. Resolved here rather than at each call site so the fallback
// cannot drift between them.
export type StudyHeaderStudy = {
    title: string | null
    submittingLabName: string | null
    submittedByOrgSlug: string
    isTestStudy: boolean
}

export function StudyPageHeader({ study }: { study: StudyHeaderStudy }) {
    const eyebrow = displayLabName(study.submittingLabName, study.submittedByOrgSlug)
    const title = (
        <Group gap="sm" align="center">
            {study.title ?? UNTITLED_STUDY_TITLE}
            <TestStudyLabel isVisible={study.isTestStudy} />
        </Group>
    )

    return <PageHeader eyebrow={eyebrow} title={title} />
}
