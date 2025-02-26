import { Selectable } from 'kysely'
import { Study as DefinedStudy, StudyJob as DefinedStudyJob } from '@/database/types'

export type Study = Selectable<DefinedStudy>

export type StudyJob = Selectable<DefinedStudyJob>
