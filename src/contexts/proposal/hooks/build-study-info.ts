import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

/**
 * Who owns `study.title` on this write.
 *
 * - `send` - the caller's form owns the title (CHANGE-REQUESTED resubmit).
 * - `omit` - someone else owns it, so leave the column alone. Step 1 owns it on a DRAFT
 *   (OTTER-690), and `onUpdateDraftStudyAction` / `finalizeStudySubmissionAction` both skip
 *   undefined keys, so omitting preserves the stored value verbatim.
 * - `omitIfBlank` - the caller owns it, but a blank must not be written: a NULL title on a
 *   non-DRAFT row violates the `study_title_required_when_not_draft` check constraint.
 *
 * Required rather than defaulted: three mutually exclusive behaviors across four write paths,
 * and a default is how a new caller silently inherits the wrong one.
 */
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
