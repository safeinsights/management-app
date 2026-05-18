import { Selectable } from 'kysely'
import { Study as DefinedStudy, StudyJob as DefinedStudyJob, StudyStatus } from '@/database/types'

export type Study = Selectable<DefinedStudy>

export type StudyJob = Selectable<DefinedStudyJob>

export type SubmittedStudy = Study & { title: string; status: Exclude<StudyStatus, 'DRAFT'> }

export function isSubmittedStudy(study: Study): study is SubmittedStudy {
    return study.status !== 'DRAFT' && study.title !== null
}

// Use when calling code knows the row must be non-DRAFT (DB CHECK constraint
// guarantees title is non-null there) but only has a `Study` in hand.
export function requireTitle(study: Pick<Study, 'id' | 'status' | 'title'>): string {
    if (study.title === null) {
        throw new Error(`Study ${study.id} has null title in status ${study.status}`)
    }
    return study.title
}
