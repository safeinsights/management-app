import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

// Who owns `study.title` on this write; required rather than defaulted so a new caller cannot
// silently inherit the wrong one. `omit` leaves the stored value alone for DRAFTs, where Step 1
// owns it (OTTER-690); `omitIfBlank` avoids writing a NULL that would violate
// `study_title_required_when_not_draft`.
export type TitleMode = 'send' | 'omit' | 'omitIfBlank'

export function buildStudyInfo(values: ProposalFormValues, titleMode: TitleMode) {
    const title = values.title?.trim() || null
    const titleField = titleMode === 'omit' || (titleMode === 'omitIfBlank' && title === null) ? {} : { title }

    return {
        ...titleField,
        piName: values.piName || undefined,
        piUserId: values.piUserId || undefined,
        datasets: values.datasets,
        researchQuestions: values.researchQuestions || undefined,
        projectSummary: values.projectSummary || undefined,
        impact: values.impact || undefined,
        additionalNotes: values.additionalNotes || undefined,
    }
}
