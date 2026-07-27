import { hasLexicalContent } from '@/lib/lexical'
import type { ProposalFormValues } from './schema'

const FIELD_LABELS = {
    title: 'Study title',
    datasets: 'Dataset(s) of interest',
    researchQuestions: 'Research question(s)',
    projectSummary: 'Project summary',
    impact: 'Impact',
    piName: 'Principal Investigator',
} as const

/**
 * Required proposal fields the researcher has not filled in yet, in the order they appear on
 * the page. Drives the hint beside a disabled Submit (OTTER-647): blur validation only flags
 * fields the user has actually visited, so a never-touched field would otherwise leave the
 * button disabled with nothing on screen explaining why.
 *
 * `additionalNotes` is intentionally absent because it is optional.
 */
export function missingProposalFields(values: ProposalFormValues): string[] {
    const missing: string[] = []

    if (!values.title?.trim()) missing.push(FIELD_LABELS.title)
    if (values.datasets.length === 0) missing.push(FIELD_LABELS.datasets)
    if (!hasLexicalContent(values.researchQuestions)) missing.push(FIELD_LABELS.researchQuestions)
    if (!hasLexicalContent(values.projectSummary)) missing.push(FIELD_LABELS.projectSummary)
    if (!hasLexicalContent(values.impact)) missing.push(FIELD_LABELS.impact)
    if (!values.piName?.trim()) missing.push(FIELD_LABELS.piName)

    return missing
}
