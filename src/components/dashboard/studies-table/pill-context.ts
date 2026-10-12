import { displayLabName, displayOrgName } from '@/lib/string'
import type { PillOrgNames } from '@/lib/study-screen'
import type { StudyRow } from './types'

export const dataPartnerDisplayName = (study: StudyRow) =>
    displayOrgName(study.reviewingEnclaveName || study.orgName || '') || null

export const labDisplayName = (study: StudyRow) =>
    displayLabName(study.submittingLabName, study.submittedByOrgSlug ?? '') || null

// Tooltips name the other side of the study. Neither name is guaranteed on a dashboard row, so both
// fall back to the role noun rather than rendering an empty gap mid-sentence.
export function pillOrgNamesFromRow(study: StudyRow): PillOrgNames {
    return {
        dataPartner: dataPartnerDisplayName(study) ?? 'the Data Partner',
        researchLab: labDisplayName(study) ?? 'the Research Lab',
    }
}
