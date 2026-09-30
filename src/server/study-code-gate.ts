import { type DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import {
    canResearcherChangeCodeFiles,
    canResearcherSubmitCodeForReview,
    projectStudyState,
    type StudyState,
} from '@/lib/study-screen'
import { rawStudyStateForStudy } from './db/study-state-query'

// Keyed 'code' so errorToString renders "Code has already been submitted...". An ActionFailure
// rather than a bare Error because a researcher whose page went stale mid-review sees this text:
// the toast and the submit notice both fall back to "An unexpected error occurred" otherwise.
const CODE_LOCKED = { code: 'has already been submitted for review and can no longer be changed' }

export const studyCodeStateFor = async (db: DBExecutor, studyId: string): Promise<StudyState | null> => {
    const raw = await rawStudyStateForStudy(studyId, db)
    return raw ? projectStudyState(raw) : null
}

const guard =
    (allows: (s: StudyState) => boolean) =>
    <Ctx extends { db: DBExecutor }>(getStudyId: (ctx: Ctx) => string) =>
    async (ctx: Ctx) => {
        // The handler's own executor, so a performsMutations action gates on the snapshot it is
        // about to write against.
        const state = await studyCodeStateFor(ctx.db, getStudyId(ctx))
        if (!state) throw new ActionFailure({ study: 'was not found' })
        if (!allows(state)) throw new ActionFailure(CODE_LOCKED)
        return {}
    }

/** Shared by /code and /resubmit: the round is open to file changes. */
export const requireChangeableCodeFiles = guard(canResearcherChangeCodeFiles)

/** /code only: refuses a second submission on a round that already has one. */
export const requireUnsubmittedCodeRound = guard(canResearcherSubmitCodeForReview)
