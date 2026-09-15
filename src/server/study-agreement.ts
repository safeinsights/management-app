import { type DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import { type UserSession } from '@/lib/types'
import { userAcknowledgedVersion, latestPublishedStudyAgreement, studyAgreementParties } from './db/legal-document'

export const STUDY_AGREEMENT_REQUIRED_MESSAGE = 'must be acknowledged before you can continue with this study'
export const STUDY_AGREEMENT_MISSING_MESSAGE = 'has not been signed yet for this study'

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

// The blocking modal is client-side, so the acts the agreement binds are guarded here too. A test
// study is exempt from needing an agreement, never from honouring one published against it anyway.
export const requireStudyAgreementAcknowledged = async (
    db: DBExecutor,
    { studyId, userId }: { studyId: string; userId: string },
) => {
    const agreement = await latestPublishedStudyAgreement(db, studyId)

    if (!agreement) {
        const study = await studyAgreementParties(db, studyId)
        if (!study || study.isTestStudy) return

        // Same exemption the pending branch gives a non-party: an SI admin holds `manage all` but
        // signs nothing, so a missing agreement is not theirs to be blocked on.
        if (!(await isPartyToStudyAgreement(db, { ...study, userId }))) return

        throw new ActionFailure({ studyAgreement: STUDY_AGREEMENT_MISSING_MESSAGE })
    }

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
