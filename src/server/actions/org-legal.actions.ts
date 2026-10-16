'use server'

import { orgLegalParams, orgStudyAgreementParams, participationAgreementTypeForOrgType } from '@/schema/legal-document'
import { orgParticipationAgreement, orgStudyAgreements } from '../db/legal-document'
import { orgIdFromSlug } from '../db/queries'
import { requireResolvedOrg } from './org-context'
import { Action } from './action'

export const fetchOrgStudyAgreementsAction = new Action('fetchOrgStudyAgreementsAction')
    .params(orgStudyAgreementParams)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'OrgLegalDocuments')
    .handler(async ({ db, orgId, orgType, params: { sort } }) => {
        requireResolvedOrg({ orgId, orgType })

        // An unsigned study carries a null versionId, so the table has one shape and no sentinel.
        return await orgStudyAgreements(db, { orgId, orgType, sort })
    })

export const fetchOrgParticipationAgreementAction = new Action('fetchOrgParticipationAgreementAction')
    .params(orgLegalParams)
    .middleware(orgIdFromSlug)
    .requireAbilityTo('view', 'OrgLegalDocuments')
    .handler(async ({ db, orgId, orgType }) => {
        requireResolvedOrg({ orgId, orgType })

        const type = participationAgreementTypeForOrgType[orgType]
        const agreement = await orgParticipationAgreement(db, { orgId, type })

        if (!agreement) return { type, agreement: null }

        return { type, agreement: { signedAt: agreement.signedAt, versionId: agreement.versionId } }
    })
