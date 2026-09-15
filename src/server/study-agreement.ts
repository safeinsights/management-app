import { type DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import { type UserSession } from '@/lib/types'
import { userAcknowledgedVersion, latestPublishedStudyAgreement } from './db/legal-document'

export const STUDY_AGREEMENT_REQUIRED_MESSAGE = 'must be acknowledged before you can continue with this study'

// orgUser, not session.orgs: stale Clerk claims would hide the modal while the guard still refused.
export const isPartyToStudyAgreement = async (
    db: DBExecutor,
    { dataPartnerId, researchLabId, userId }: { dataPartnerId: string; researchLabId: string; userId: string },
) =>
    Boolean(
        await db
            .selectFrom('orgUser')
            .select('id')
            .where('userId', '=', userId)
            .where('orgId', 'in', [dataPartnerId, researchLabId])
            .executeTakeFirst(),
    )

// The blocking modal is client-side, so the acts the agreement binds are guarded here too. No
// published agreement means no block, or every approved study stalls on SI admin paperwork.
export const requireStudyAgreementAcknowledged = async (
    db: DBExecutor,
    { studyId, userId }: { studyId: string; userId: string },
) => {
    const agreement = await latestPublishedStudyAgreement(db, studyId)
    if (!agreement) return

    if (!(await isPartyToStudyAgreement(db, { ...agreement, userId }))) return

    if (!(await userAcknowledgedVersion(db, { versionId: agreement.versionId, userId }))) {
        throw new ActionFailure({ studyAgreement: STUDY_AGREEMENT_REQUIRED_MESSAGE })
    }
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
