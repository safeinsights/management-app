'use server'

import {
    userParticipationAgreementParams,
    userStudyAgreementParams,
    globalDocumentTypeParams,
    type ResolvedLegalDocument,
} from '@/schema/legal-document'
import { userParticipationAgreements, userStudyAgreements } from '@/server/db/legal-document'
import { bodyForVersion } from '@/server/legal-document'
import { Action } from './action'
import { latestVersionsOfTypes } from '@/server/db/legal-document-versions'

export const fetchUserStudyAgreementsAction = new Action('fetchUserStudyAgreementsAction')
    .params(userStudyAgreementParams)
    .requireAbilityTo('view', 'UserLegalDocuments')
    .handler(async ({ db, session, params: { sort } }) => {
        return await userStudyAgreements(db, { userId: session.user.id, sort })
    })

export const fetchUserParticipationAgreementsAction = new Action('fetchUserParticipationAgreementsAction')
    .params(userParticipationAgreementParams)
    .requireAbilityTo('view', 'UserLegalDocuments')
    .handler(async ({ db, session, params: { type, sort } }) => {
        return await userParticipationAgreements(db, { userId: session.user.id, type, sort })
    })

// The terms in force, not the version the user acked. Those coincide whenever the login gate has
// done its job; ackedAt is looked up separately so it reads null for a user who reached the page
// still owing this version.
export const fetchUserGlobalDocumentAction = new Action('fetchUserGlobalDocumentAction')
    .params(globalDocumentTypeParams)
    .requireAbilityTo('view', 'UserLegalDocuments')
    .handler(
        async ({
            db,
            session,
            params: { type },
        }): Promise<(ResolvedLegalDocument & { publishedAt: Date | null; ackedAt: Date | null }) | null> => {
            const [version] = await latestVersionsOfTypes(db, [type], [])
            if (!version) return null

            const ack = await db
                .selectFrom('legalDocumentAcknowledgement')
                .select('ackedAt')
                .where('legalDocumentVersionId', '=', version.versionId)
                .where('userId', '=', session.user.id)
                .executeTakeFirst()

            return {
                type,
                versionId: version.versionId,
                publishedAt: version.publishedAt,
                ackedAt: ack?.ackedAt ?? null,
                ...(await bodyForVersion(version)),
            }
        },
    )
