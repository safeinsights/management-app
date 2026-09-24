import { displayLabName, displayOrgName } from '@/lib/string'
import type { PillOrgNames } from '@/lib/study-screen'
import type { StudyRow } from './types'

// Tooltips name the other side of the study. Neither name is guaranteed on a dashboard row, so both
// fall back to the role noun rather than rendering an empty gap mid-sentence.
export function pillOrgNamesFromRow(study: StudyRow): PillOrgNames {
    return {
        dataPartner: displayOrgName(study.reviewingEnclaveName || study.orgName || '') || 'the Data Partner',
        researchLab: displayLabName(study.submittingLabName, study.submittedByOrgSlug ?? '') || 'the Research Lab',
    }
}
