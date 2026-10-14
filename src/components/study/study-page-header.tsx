import { Stack, Group } from '@mantine/core'
import { PageHeader } from '@/components/page-header'
import { UNTITLED_STUDY_TITLE } from '@/lib/string'
import { TestStudyLabel } from './test-study-label'

// Every study page shows the submitting Research Lab, so both a researcher and a reviewer of the
// same study read the same eyebrow.
export type StudyHeaderStudy = {
    title: string | null
    submittingLabName: string
    isTestStudy: boolean
}

export function StudyPageHeader({ study }: { study: StudyHeaderStudy }) {
    const title = (
        <Group gap="sm" align="center">
            <Stack gap="md" align="flex-start">
                {study.title ?? UNTITLED_STUDY_TITLE}
                <TestStudyLabel isVisible={study.isTestStudy} />
            </Stack>
        </Group>
    )

    return <PageHeader eyebrow={study.submittingLabName} title={title} />
}
