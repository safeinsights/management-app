import { expect, goto, readTestSupportFile, test, visitAsRole, withRole } from './e2e.helpers'
import {
    resolveUserId,
    seedProposalPendingReview,
    seedQaOwnedStudy,
    seedThrowawayUser,
    studyExists,
    userExists,
} from './e2e.seed'
import { createQaClient } from './api/qa-client'
import { REVIEWER_DASHBOARD } from './flows/dashboard.flows'

// The QA provisioning routes, which the deployed-environment suite relies on to seed and clean up.
// Under the fake Clerk every bearer is the SI admin, so authorization is not what these test; the
// qa- guard on every target is.

const fingerprintOfTestKey = async () => (await readTestSupportFile('public_key.sig')).split('= ')[1].trim()

test('an invite can be minted and its link opens the invitation', { tag: '@api' }, async ({ browser, request }) => {
    const qa = createQaClient(request)
    const email = `qa-e2e-invite-${Date.now().toString(36)}@example.com`

    const created = await qa.invite({ email, orgSlug: 'openstax-lab' })
    expect(created.status(), await created.text()).toBe(201)
    const invite = JSON.parse(await created.text()) as { inviteId: string; inviteUrl: string; alreadyInvited: boolean }
    expect(invite).toMatchObject({ email, orgSlug: 'openstax-lab', isAdmin: false, alreadyInvited: false })
    expect(invite.inviteUrl).toContain(`/account/invitation/${invite.inviteId}`)

    // Minting again hands back the open invite rather than a second one.
    const repeated = await qa.invite({ email, orgSlug: 'openstax-lab' })
    expect(repeated.status()).toBe(200)
    expect((JSON.parse(await repeated.text()) as { alreadyInvited: boolean; inviteId: string }).inviteId).toBe(
        invite.inviteId,
    )

    const refused = await qa.invite({ email: `real-person-${Date.now()}@example.com`, orgSlug: 'openstax-lab' })
    expect(refused.status()).toBe(403)
    expect((JSON.parse(await refused.text()) as { error: string }).error).toContain('is not a QA account')

    // The link lands a signed-out visitor on the invitation, with the two ways in.
    const context = await browser.newContext()
    try {
        const page = await context.newPage()
        await goto(page, `/account/invitation/${invite.inviteId}`)
        await expect(page.getByText('You’ve been invited to join SafeInsights!')).toBeVisible()
        await expect(page.getByRole('link', { name: 'Create New Account' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Login with existing account' })).toBeVisible()
    } finally {
        await context.close()
    }
})

test('a QA account can be re-provisioned and deleted', { tag: '@api' }, async ({ request }) => {
    const qa = createQaClient(request)
    const user = await seedThrowawayUser({ emailPrefix: 'qa-e2e-user' })

    const provisioned = await qa.patchUser(user.email, {
        orgs: [{ slug: 'openstax-lab' }, { slug: 'openstax', isAdmin: true }],
        publicKey: await readTestSupportFile('public_key.pem'),
    })
    expect(provisioned.status(), await provisioned.text()).toBe(200)
    expect(JSON.parse(await provisioned.text())).toEqual({
        userId: user.userId,
        orgs: [
            { slug: 'openstax', isAdmin: true },
            { slug: 'openstax-lab', isAdmin: false },
        ],
        fingerprint: await fingerprintOfTestKey(),
        passwordSet: false,
    })

    // An empty list is meaningful: it removes every membership.
    const cleared = await qa.patchUser(user.userId, { orgs: [] })
    expect((JSON.parse(await cleared.text()) as { orgs: unknown[] }).orgs).toEqual([])

    // The guard is on the stored address, so a real account cannot be reached by id either.
    const real = await seedThrowawayUser({ emailPrefix: 'e2e-real-user' })
    expect((await qa.patchUser(real.userId, { orgs: [] })).status()).toBe(403)

    // Deleting takes the studies the account owns with it.
    const { studyId } = await seedQaOwnedStudy('owned by a throwaway qa account', { researcherId: user.userId })
    const deleted = await qa.deleteUser(user.email)
    expect(deleted.status(), await deleted.text()).toBe(200)
    expect(JSON.parse(await deleted.text())).toEqual({ deleted: user.email })
    expect(await userExists(user.userId)).toBe(false)
    expect(await studyExists(studyId)).toBe(false)
})

test(
    'a QA study can be driven to any state and deleted',
    { tag: '@api' },
    async ({ browser, request, studyFeatures }) => {
        const qa = createQaClient(request)
        const studyTitle = studyFeatures.uniqueTitle('qa-state')
        const { studyId } = await seedQaOwnedStudy(studyTitle)

        const submitted = await qa.setStudyState(studyId, { jobStatus: 'CODE-SUBMITTED' })
        expect(submitted.status(), await submitted.text()).toBe(200)
        expect(JSON.parse(await submitted.text())).toMatchObject({
            studyId,
            jobCreated: true,
            jobStatus: 'CODE-SUBMITTED',
        })

        // Plaintext in, encrypted for the Data Partner's keys out: what an enclave run would have left.
        const complete = await qa.setStudyState(studyId, {
            jobStatus: 'RUN-COMPLETE',
            result: { name: 'results.csv', content: 'metric,value\nmean,1\n' },
        })
        expect(complete.status(), await complete.text()).toBe(200)
        expect(JSON.parse(await complete.text())).toMatchObject({
            jobStatus: 'RUN-COMPLETE',
            files: [{ key: 'result', fileType: 'ENCRYPTED-RESULT', name: 'results.csv' }],
        })

        await withRole(browser, 'reviewer', async (page) => {
            await visitAsRole(page, REVIEWER_DASHBOARD)
            await expect(
                page.getByRole('row').filter({ hasText: studyTitle }).getByText('Outputs need review'),
            ).toBeVisible()
        })

        const removed = await qa.deleteStudy(studyId)
        expect(removed.status(), await removed.text()).toBe(200)
        expect(JSON.parse(await removed.text())).toEqual({ deleted: studyId })
        expect(await studyExists(studyId)).toBe(false)

        const unknown = await qa.deleteStudy('00000000-0000-7000-8000-000000000000')
        expect(unknown.status()).toBe(404)

        // A study owned by a real researcher is out of reach.
        const real = await seedProposalPendingReview(studyFeatures.uniqueTitle('qa-guarded'))
        const refused = await qa.deleteStudy(real.studyId)
        expect(refused.status()).toBe(403)
        expect((JSON.parse(await refused.text()) as { error: string }).error).toContain('is not a QA account')
    },
)

test('the admin route deletes a real account but never the caller', { tag: '@api' }, async ({ request }) => {
    const qa = createQaClient(request)
    const user = await seedThrowawayUser({ emailPrefix: 'e2e-real-member', orgSlug: 'openstax-lab' })

    const deleted = await qa.adminDeleteUser(user.userId)
    expect(deleted.status(), await deleted.text()).toBe(200)
    expect(JSON.parse(await deleted.text())).toEqual({ deleted: user.userId })
    expect(await userExists(user.userId)).toBe(false)

    const self = await qa.adminDeleteUser(await resolveUserId('admin'))
    expect(self.status()).toBe(400)
    expect(JSON.parse(await self.text())).toEqual({ error: 'cannot delete your own account' })
    expect(await userExists(await resolveUserId('admin'))).toBe(true)
})
