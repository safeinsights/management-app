import { globalAcknowledgementUrl } from '@/lib/global-acknowledgement-redirect'
import { REQUEST_PATH_HEADER } from '@/lib/request-path'
import { Routes } from '@/lib/routes'
import {
    beforeEach,
    describe,
    expect,
    faker,
    insertTestLegalDocument,
    it,
    mockSessionWithTestData,
    resetLegalDocuments,
} from '@/tests/unit.helpers'
import { db } from '@/database'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireGlobalAcknowledgement } from './global-acknowledgement-gate'

const requestPath = async (path: string) => (await headers()).set(REQUEST_PATH_HEADER, path)

// A seeded database would leave its own tos/pn owed alongside the one under test.
beforeEach(resetLegalDocuments)

const userOwingTos = async () => {
    const session = await mockSessionWithTestData()
    const tos = await insertTestLegalDocument({ type: 'TOS', publishedBy: session.user.id })
    return { ...session, tos }
}

describe('requireGlobalAcknowledgement', () => {
    it('sends a user owing the Terms of Service to the acknowledgement step, carrying the page they asked for', async () => {
        const { org } = await userOwingTos()
        const studyPage = `${Routes.studyReview({ orgSlug: org.slug, studyId: faker.string.uuid() })}?tab=code`
        await requestPath(studyPage)

        await requireGlobalAcknowledgement()

        expect(redirect).toHaveBeenCalledWith(globalAcknowledgementUrl(studyPage))
    })

    it('falls back to My dashboard when the request path is unknown', async () => {
        await userOwingTos()

        await requireGlobalAcknowledgement()

        expect(redirect).toHaveBeenCalledWith(globalAcknowledgementUrl(Routes.dashboard))
    })

    it('gates /legal like any other app page', async () => {
        await userOwingTos()
        await requestPath(Routes.legal)

        await requireGlobalAcknowledgement()

        expect(redirect).toHaveBeenCalledWith(globalAcknowledgementUrl(Routes.legal))
    })

    it('lets a user through once they have acknowledged', async () => {
        const { user, tos } = await userOwingTos()
        await db
            .insertInto('legalDocumentAcknowledgement')
            .values({ legalDocumentVersionId: tos.id, userId: user.id })
            .execute()

        await requireGlobalAcknowledgement()

        expect(redirect).not.toHaveBeenCalled()
    })

    // ROPA/DOPA keep their modal in AppShell.
    it('lets a user through who owes only a participation agreement', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })
        await insertTestLegalDocument({ type: 'ROPA', orgId: org.id, publishedBy: user.id })

        await requireGlobalAcknowledgement()

        expect(redirect).not.toHaveBeenCalled()
    })
})
