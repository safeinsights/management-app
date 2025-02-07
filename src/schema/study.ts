import { Selectable } from 'kysely'
import { Study as DefinedStudy } from '@/database/types'

export type Study = Selectable<DefinedStudy>
