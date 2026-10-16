'use server'

import { urlForLegalDocumentVersion } from '../legal-document'
import { Action } from './action'
import { noDocumentScope } from './legal-document-scope'

export const fetchStudyAgreementsAction = new Action('fetchStudyAgreementsAction')
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db }) => {
        const rows = await db
            .selectFrom('legalDocument')
            .innerJoin('legalDocumentVersion', 'legalDocumentVersion.legalDocumentId', 'legalDocument.id')
            .innerJoin('study', 'study.id', 'legalDocument.studyId')
            .innerJoin('org as dataPartner', 'dataPartner.id', 'study.orgId')
            .innerJoin('org as researchLab', 'researchLab.id', 'study.submittedByOrgId')
            .select([
                'legalDocument.id as legalDocumentId',
                'legalDocumentVersion.id as versionId',
                'legalDocumentVersion.versionNumber',
                'legalDocumentVersion.filePath',
                'legalDocumentVersion.fileName',
                'legalDocumentVersion.format',
                'legalDocumentVersion.publishedAt',
                'legalDocumentVersion.signedAt',
                'study.id as studyId',
                'study.title as studyTitle',
                'researchLab.name as researchLabName',
                'dataPartner.name as dataPartnerName',
            ])
            .where('legalDocument.type', '=', 'SLA')
            .where('legalDocumentVersion.publishedAt', 'is not', null)
            .distinctOn('legalDocument.id')
            .orderBy('legalDocument.id')
            .orderBy('legalDocumentVersion.versionNumber', 'desc')
            .execute()

        // distinctOn dictates the ORDER BY above, so display order is applied after the fact.
        rows.sort(
            (a, b) =>
                a.dataPartnerName.localeCompare(b.dataPartnerName) ||
                a.researchLabName.localeCompare(b.researchLabName) ||
                (a.studyTitle ?? a.studyId).localeCompare(b.studyTitle ?? b.studyId),
        )

        return await Promise.all(
            rows.map(async (row) => ({ ...row, downloadUrl: await urlForLegalDocumentVersion(row) })),
        )
    })

export const fetchStudiesAwaitingStudyAgreementAction = new Action('fetchStudiesAwaitingStudyAgreementAction')
    .middleware(noDocumentScope)
    .requireAbilityTo('view', 'LegalDocument')
    .handler(async ({ db }) => {
        return await db
            .selectFrom('study')
            .innerJoin('org as dataPartner', 'dataPartner.id', 'study.orgId')
            .innerJoin('org as researchLab', 'researchLab.id', 'study.submittedByOrgId')
            .select([
                'study.id as studyId',
                'study.title as studyTitle',
                'dataPartner.id as dataPartnerId',
                'dataPartner.name as dataPartnerName',
                'researchLab.id as researchLabId',
                'researchLab.name as researchLabName',
            ])
            .where('study.status', '=', 'APPROVED')
            .where('study.deletedAt', 'is', null)
            // A test study needs no agreement, so leaving it here would queue work that never ends.
            .where('study.isTestStudy', '=', false)
            // Keyed on a PUBLISHED version, not the document row: that row is written before the
            // file is uploaded, so an abandoned upload would hide the study from both screens.
            .where((eb) =>
                eb.not(
                    eb.exists(
                        eb
                            .selectFrom('legalDocument')
                            .innerJoin(
                                'legalDocumentVersion',
                                'legalDocumentVersion.legalDocumentId',
                                'legalDocument.id',
                            )
                            .select('legalDocument.id')
                            .whereRef('legalDocument.studyId', '=', 'study.id')
                            .where('legalDocument.type', '=', 'SLA')
                            .where('legalDocumentVersion.publishedAt', 'is not', null),
                    ),
                ),
            )
            .orderBy('dataPartner.name')
            .orderBy('researchLab.name')
            .orderBy('study.title')
            .execute()
    })
