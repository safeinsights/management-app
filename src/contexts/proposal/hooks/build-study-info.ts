import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

export function buildStudyInfo(values: ProposalFormValues) {
    return {
        title: values.title?.trim() || null,
        piName: values.piName || undefined,
        piUserId: values.piUserId || undefined,
        datasets: values.datasets,
        researchQuestions: values.researchQuestions || undefined,
        projectSummary: values.projectSummary || undefined,
        impact: values.impact || undefined,
        additionalNotes: values.additionalNotes || undefined,
    }
}
