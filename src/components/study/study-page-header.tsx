import { PageHeader, type PageHeaderStep } from '@/components/page-header'
import { UNTITLED_STUDY_TITLE } from '@/lib/string'
import { TestStudyLabel } from './test-study-label'

// Every study page shows the submitting Research Lab, so both a researcher and a reviewer of the
// same study read the same eyebrow.
export type StudyHeaderStudy = {
    title: string | null
    submittingLabName: string
    isTestStudy: boolean
}

export function StudyPageHeader({ study, step }: { study: StudyHeaderStudy; step?: PageHeaderStep }) {
    return (
        <PageHeader
            eyebrow={study.submittingLabName}
            title={study.title ?? UNTITLED_STUDY_TITLE}
            step={step}
            badge={<TestStudyLabel isVisible={study.isTestStudy} />}
        />
    )
}
