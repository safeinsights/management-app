import { Stack, Group, VisuallyHidden } from '@mantine/core'
import { PageHeader } from '@/components/page-header'
import { displayLabName, UNTITLED_STUDY_TITLE } from '@/lib/string'
import type { StudyHeaderStep } from './proposal-step-header'
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

// "STEP 3" is uppercase in the source, and some screen readers spell all-caps words out letter by letter.
const stepAnnouncement = ({ label, heading }: StudyHeaderStep) =>
    `${label.charAt(0)}${label.slice(1).toLowerCase()}: ${heading}`

// The visible H1 is the study title alone (a UX decision pending review), so a screen reader would
// otherwise hear the same heading on every step of the study (OTTER-823).
const HiddenStep = ({ step }: { step?: StudyHeaderStep }) => {
    if (!step) return null

    return <VisuallyHidden component="span"> — {stepAnnouncement(step)}</VisuallyHidden>
}

export function StudyPageHeader({ study, step }: { study: StudyHeaderStudy; step?: StudyHeaderStep }) {
    const eyebrow = displayLabName(study.submittingLabName, study.submittedByOrgSlug)
    const title = (
        <Group gap="sm" align="center">
            <Stack gap="md" align="flex-start">
                <span>
                    {study.title ?? UNTITLED_STUDY_TITLE}
                    <HiddenStep step={step} />
                </span>
                <TestStudyLabel isVisible={study.isTestStudy} />
            </Stack>
        </Group>
    )

    return <PageHeader eyebrow={eyebrow} title={title} />
}
