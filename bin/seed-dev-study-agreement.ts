/* eslint-disable no-console */
/**
 * DEV-ONLY: an APPROVED study with a published Study Agreement whose PDF really exists in S3, so
 * the blocking modal has something to enforce and its link opens a readable document. The other
 * dev seeds stop short of this: seed-dev-studies leaves studies without an agreement (that is what
 * the admin upload cascade needs), and seed-dev-legal only covers the global tos/pn pair.
 *
 * Every member of the study's two orgs owes the acknowledgement, including your own dev login if
 * you belong to either, which is why this sits behind the same gate as the other fixture writers.
 *
 * Run inside the container:
 *   docker exec mgmnt-app sh -c 'ALLOW_TESTING_DATA=TRUE pnpm exec tsx bin/seed-dev-study-agreement.ts [enclaveSlug] [labSlug]'
 */
import { v7 as uuidv7 } from 'uuid'
import { db } from '@/database'
import { pathForLegalDocumentVersion } from '@/lib/paths'
import { storeS3File } from '@/server/aws'
import { findOrCreateLegalDocument } from '@/server/db/legal-document'
import { resolveUserId, seedStudyFor } from '../tests/e2e.seed'
import { testingDataAllowed } from './lib/testing-data-gate'

const DEFAULT_ENCLAVE = 'openstax'
const DEFAULT_LAB = 'openstax-lab'

// A real PDF rather than a text file with a .pdf name: the modal links out with target=_blank and
// the point of the fixture is that the tab renders something.
const pdfFixture = (heading: string): Buffer => {
    const content = `BT /F1 16 Tf 72 720 Td (${heading.replace(/[()\\]/g, '')}) Tj ET`
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]

    let pdf = '%PDF-1.4\n'
    const offsets: number[] = []
    objects.forEach((body, index) => {
        offsets.push(pdf.length)
        pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
    })

    const xrefOffset = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

    return Buffer.from(pdf, 'latin1')
}

const toStream = (buffer: Buffer): ReadableStream =>
    new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(buffer))
            controller.close()
        },
    })

const main = async () => {
    if (!testingDataAllowed('seed-dev-study-agreement')) return

    const enclaveSlug = process.argv[2] ?? DEFAULT_ENCLAVE
    const labSlug = process.argv[3] ?? DEFAULT_LAB

    const title = `Study Agreement gate ${Date.now()}`
    const { studyId } = await seedStudyFor({ title, status: 'APPROVED', enclaveSlug, labSlug })

    const { id: legalDocumentId } = await findOrCreateLegalDocument(db, { type: 'SLA', studyId })
    const versionId = uuidv7()
    const filePath = pathForLegalDocumentVersion({ type: 'SLA', legalDocumentId, versionId })

    await storeS3File({ orgSlug: labSlug, studyId }, toStream(pdfFixture(title)), filePath)

    await db
        .insertInto('legalDocumentVersion')
        .values({
            id: versionId,
            legalDocumentId,
            versionNumber: 1,
            fileName: 'study-agreement.pdf',
            format: 'pdf',
            filePath,
            publishedAt: new Date(),
            publishedBy: await resolveUserId('admin'),
            signedAt: new Date().toISOString().slice(0, 10),
        })
        .execute()

    const owing = await db
        .selectFrom('orgUser')
        .innerJoin('user', 'user.id', 'orgUser.userId')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .select(['user.email', 'org.slug'])
        .where('orgUser.orgId', 'in', (eb) =>
            eb
                .selectFrom('study')
                .select('study.orgId')
                .where('study.id', '=', studyId)
                .union(eb.selectFrom('study').select('study.submittedByOrgId').where('study.id', '=', studyId)),
        )
        .orderBy('org.slug')
        .orderBy('user.email')
        .execute()

    console.log(`\nstudy   ${studyId}`)
    console.log(`title   ${title}`)
    console.log(`file    ${filePath}`)
    console.log(`\nresearcher  http://localhost:4000/${labSlug}/study/${studyId}/submitted?returnTo=org`)
    console.log(`reviewer    http://localhost:4000/${enclaveSlug}/study/${studyId}/review`)
    console.log('\nowes the acknowledgement:')
    for (const row of owing) console.log(`  ${row.slug.padEnd(24)} ${row.email}`)

    await db.destroy()
}

main().catch(async (error) => {
    console.error(error)
    await db.destroy()
    process.exit(1)
})
