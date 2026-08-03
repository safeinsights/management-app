import { hasLexicalContent } from '@/lib/lexical'
import { isLinkedPiUserId, type ProposalFormValues } from './schema'

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
    // Also missing when the name has no linked user: submission requires the id, but no field
    // displays it, so without this a legacy draft disabled submit while naming nothing (OTTER-647).
    // Uses the schema's own UUID check, so an id that is present but malformed is reported here
    // rather than dropping out of the hint while still failing submit.
    if (!values.piName?.trim() || !isLinkedPiUserId(values.piUserId)) missing.push(FIELD_LABELS.piName)

    return missing
}
