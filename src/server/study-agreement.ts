import { type DBExecutor } from '@/database'
import { ActionFailure } from '@/lib/errors'
import { type UserSession } from '@/lib/types'
import { userAcknowledgedVersion, latestPublishedStudyAgreement } from './db/legal-document'

export const STUDY_AGREEMENT_REQUIRED_MESSAGE = 'must be acknowledged before you can continue with this study'

// The modal blocking the study pages is client-side, so the acts the agreement actually binds —
// submitting code into an enclave, releasing results — are checked here where they cannot be
// bypassed. No published agreement means no block: most approved studies sit there while SI admin
// draws one up.
export const requireStudyAgreementAcknowledged = async (
    db: DBExecutor,
    { studyId, userId }: { studyId: string; userId: string },
) => {
    const agreement = await latestPublishedStudyAgreement(db, studyId)
    if (!agreement) return

    // Only the two orgs the agreement binds owe one; an SI admin acting on the study is not a party.
    const isParty = await db
        .selectFrom('orgUser')
        .select('id')
        .where('userId', '=', userId)
        .where('orgId', 'in', [agreement.dataPartnerId, agreement.researchLabId])
        .executeTakeFirst()

    if (!isParty) return

    if (!(await userAcknowledgedVersion(db, { versionId: agreement.versionId, userId }))) {
        throw new ActionFailure({ studyAgreement: STUDY_AGREEMENT_REQUIRED_MESSAGE })
    }
}

// Action-chain form of the guard, declared after .requireAbilityTo so it cannot drift into the
// middle of a handler. studyId stays per-action rather than being read off params generically:
// submitOutputsDecisionAction trusts only the job id and derives the study from it.
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
