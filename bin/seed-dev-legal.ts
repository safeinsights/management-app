/* eslint-disable no-console */
/**
 * DEV-ONLY: publish the Terms of Service and Privacy Notice the e2e suite uses, so the admin Legal
 * page has versions to show and the login gate has something to enforce. Without them every tos/pn
 * panel reads "No published version yet" on a fresh database.
 *
 * Publishing a Terms of Service obliges every user of the database it lands in, including your own
 * dev login, which is why seedLegalDocuments refuses to run against a non-disposable host. The
 * `legal` role is left owing the newer version so the acknowledgement modal can be demonstrated.
 *
 * Run inside the container:
 *   docker exec mgmnt-app pnpm exec tsx bin/seed-dev-legal.ts
 */
import { db } from '@/database'
import { seedLegalDocuments } from '../tests/e2e.seed'

const main = async () => {
    await seedLegalDocuments()

    const versions = await db
        .selectFrom('legalDocumentVersion')
        .innerJoin('legalDocument', 'legalDocument.id', 'legalDocumentVersion.legalDocumentId')
        .select(['legalDocument.type', 'legalDocumentVersion.versionNumber'])
        .where('legalDocument.type', 'in', ['TOS', 'PN'])
        .where('legalDocumentVersion.publishedAt', 'is not', null)
        .orderBy('legalDocument.type')
        .orderBy('legalDocumentVersion.versionNumber')
        .execute()

    for (const version of versions) {
        console.log(`  ${version.type.padEnd(4)} v${version.versionNumber}`)
    }
    console.log('\nEveryone but the `legal` role is acknowledged up to date.')
    await db.destroy()
}

main().catch(async (error) => {
    console.error(error)
    await db.destroy()
    process.exit(1)
})
