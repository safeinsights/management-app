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
import { readFile } from 'fs/promises'
import { db } from '@/database'
import { storeS3File } from '@/server/aws'
import { writeStudyAgreementVersion } from '@/server/db/legal-document'
import { resolveUserId, seedStudyFor } from '../tests/e2e.seed'
import { testingDataAllowed } from './lib/testing-data-gate'

const DEFAULT_ENCLAVE = 'openstax'
const DEFAULT_LAB = 'openstax-lab'

const main = async () => {
    if (!testingDataAllowed('seed-dev-study-agreement')) return

    const enclaveSlug = process.argv[2] ?? DEFAULT_ENCLAVE
    const labSlug = process.argv[3] ?? DEFAULT_LAB

    const title = `Study Agreement gate ${Date.now()}`
    // withStudyAgreement: false because an APPROVED study otherwise gets a version 1 that every
    // party has already acknowledged, which both collides with the write below and hides the modal.
    const { studyId } = await seedStudyFor({
        title,
        status: 'APPROVED',
        enclaveSlug,
        labSlug,
        withStudyAgreement: false,
    })

    const { filePath } = await writeStudyAgreementVersion(db, {
        studyId,
        publishedBy: await resolveUserId('admin'),
        signedAt: new Date().toISOString().slice(0, 10),
    })

    // Unlike the e2e seed, this one puts a real PDF behind the key so the modal's link opens.
    const pdf = await readFile('tests/assets/empty.pdf')
    await storeS3File({ orgSlug: labSlug, studyId }, new File([pdf], 'study-agreement.pdf').stream(), filePath)

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
