import { Selectable } from 'kysely'
import { Study as DefinedStudy, StudyJob as DefinedStudyJob, StudyStatus } from '@/database/types'

export type Study = Selectable<DefinedStudy>

export type StudyJob = Selectable<DefinedStudyJob>

type StudyShape = { status: StudyStatus; title: string | null }

export type Submitted<T extends StudyShape> = T & { title: string; status: Exclude<StudyStatus, 'DRAFT'> }

export type SubmittedStudy = Submitted<Study>

export function isSubmittedStudy<T extends StudyShape>(study: T): study is Submitted<T> {
    return study.status !== 'DRAFT' && study.title !== null
}
