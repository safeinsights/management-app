'use server'

import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import {
    participationAgreementTypeParams,
    participationAgreementTypeForOrgType,
    participationAgreementOrgTypes,
    inviteParams,
} from '@/schema/legal-document'
import { orgParticipationAgreement } from '../db/legal-document'
import { bodyForVersion, urlForLegalDocumentVersion } from '../legal-document'
import { Action } from './action'
import { noDocumentScope } from './legal-document-scope'

export const fetchParticipationAgreementsAction = new Action('fetchParticipationAgreementsAction')
    .params(participationAgreementTypeParams)
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db, params: { type } }) => {
        const rows = await db
            .selectFrom('legalDocument')
            .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
            .innerJoin('org', 'org.id', 'legalDocument.orgId')
            .select([
                'legalDocument.id as legalDocumentId',
                'legalDocumentVersion.id as versionId',
                'legalDocumentVersion.versionNumber',
                'legalDocumentVersion.filePath',
                'legalDocumentVersion.fileName',
                'legalDocumentVersion.format',
                'legalDocumentVersion.publishedAt',
                'legalDocumentVersion.signedAt',
                'org.id as orgId',
                'org.name as orgName',
            ])
            .where('legalDocument.type', '=', type)
            .where('legalDocumentVersion.publishedAt', 'is not', null)
            .distinctOn('legalDocument.id')
            .orderBy('legalDocument.id')
            .orderBy('legalDocumentVersion.versionNumber', 'desc')
            .execute()

        rows.sort((a, b) => a.orgName.localeCompare(b.orgName))

        return await Promise.all(
            rows.map(async (row) => ({ ...row, downloadUrl: await urlForLegalDocumentVersion(row) })),
        )
    })

// An org that has already signed stays selectable: a renewal is a new version of the same document.
export const fetchParticipationSignatoriesAction = new Action('fetchParticipationSignatoriesAction')
    .params(participationAgreementTypeParams)
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(({ db, params: { type } }) =>
        db
            .selectFrom('org')
            .select(['org.id as orgId', 'org.name as orgName'])
            .where('org.type', '=', participationAgreementOrgTypes[type])
            .where('org.slug', '!=', CLERK_ADMIN_ORG_SLUG)
            .orderBy('org.name')
            .execute(),
    )

export type ParticipationData = {
    versionId: string
    type: 'ROPA' | 'DOPA'
    url: string
}

/**
 * The published ropa/dopa the invite's org owes, or null when none is published yet.
 *
 * Read by the invitation signup form, so null (an ordinary state) stands for "nothing to show or
 * agree to" rather than a sentinel row the caller has to decode.
 */
export const fetchParticipationAgreementFromInviteIdAction = new Action('fetchParticipationAgreementFromInviteIdAction')
    .params(inviteParams)
    // Unauthenticated by necessity: the signup form has only the invite id. That makes an
    // unclaimed invite id a bearer token for this org's executed agreement, and invites
    // have no TTL - revoking means deleting the row.
    .handler(async ({ db, params: { inviteId } }): Promise<ParticipationData | null> => {
        const inviteOrgDetails: { inviteId: string; type: 'enclave' | 'lab'; orgId: string } | undefined = await db
            .selectFrom('pendingUser')
            .innerJoin('org', 'org.id', 'pendingUser.orgId')
            .select(['pendingUser.id as inviteId', 'org.type', 'org.id as orgId'])
            .where('pendingUser.id', '=', inviteId)
            .where('pendingUser.claimedByUserId', 'is', null)
            .executeTakeFirst()

        if (!inviteOrgDetails) return null

        const doctype = participationAgreementTypeForOrgType[inviteOrgDetails.type]

        const agreement = await orgParticipationAgreement(db, { orgId: inviteOrgDetails.orgId, type: doctype })
        if (!agreement) return null

        const body = await bodyForVersion({ type: doctype, filePath: agreement.filePath, fileName: agreement.fileName })
        // `legalDocumentFormats` fixes ropa/dopa as pdf, so this narrowing cannot fail.
        if (body.format !== 'pdf') throw new Error('participation agreement is not a pdf')

        return {
            versionId: agreement.versionId,
            type: doctype,
            url: body.url,
        }
    })
