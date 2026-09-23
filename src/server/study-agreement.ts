import { type DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import { legalDocumentTypeLabels, type StudyAgreementStatus } from '@/schema/legal-document'
import { type UserSession } from '@/lib/types'
import { studyAgreementState } from './db/legal-document'

// One resolver for the client gate and the server guards, so the modal and the refusal cannot
// disagree. Undefined only when the study does not exist; callers decide what that means.
export const studyAgreementStatusFor = async (
    db: DBExecutor,
    { studyId, userId }: { studyId: string; userId: string },
): Promise<StudyAgreementStatus | undefined> => {
    const study = await studyAgreementState(db, { studyId, userId })
    if (!study) return undefined

    // An SI admin holds `manage all` but signs nothing, so neither a missing nor an unacknowledged
    // agreement is theirs to be blocked on.
    if (!study.isParty) return { state: 'notAParty' }

    // A test study is exempt from needing an agreement, never from honouring one published anyway.
    if (!study.versionId)
        return study.isTestStudy
            ? { state: 'exempt' }
            : {
                  state: 'none',
                  researchLabName: study.researchLabName,
                  dataPartnerName: study.dataPartnerName,
              }

    if (study.hasAcknowledged) return { state: 'acknowledged' }

    return { state: 'pending', versionId: study.versionId }
}

// The blocking modal is client-side, so the acts the agreement binds are guarded here too.
export const requireStudyAgreementAcknowledged = async (
    db: DBExecutor,
    { studyId, userId }: { studyId: string; userId: string },
) => {
    const status = await studyAgreementStatusFor(db, { studyId, userId })

    if (!status) throw new ActionFailure({ study: 'was not found' })
    // The key is the label, not a camelCase field: errorToString capitalises it into the message, so
    // 'studyAgreement' reached the user as "StudyAgreement must be...".
    if (status.state === 'none')
        throw new ActionFailure({ [legalDocumentTypeLabels.SLA]: 'has not been signed yet for this study' })
    if (status.state === 'pending')
        throw new ActionFailure({
            [legalDocumentTypeLabels.SLA]: 'must be acknowledged before you can continue with this study',
        })
}

// studyId comes from the caller: submitOutputsDecisionAction has only the job id to derive it from.
export const requireStudyAgreement =
    <Ctx extends { session?: UserSession; db: DBExecutor }>(getStudyId: (ctx: Ctx) => string) =>
    async (ctx: Ctx) => {
        if (!ctx.session) throw new ActionFailure({ user: 'is not logged in' })

        await requireStudyAgreementAcknowledged(ctx.db, {
            studyId: getStudyId(ctx),
            userId: ctx.session.user.id,
        })

        return {}
    }
