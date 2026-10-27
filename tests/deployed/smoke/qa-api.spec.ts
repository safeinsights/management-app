import { createQaClient } from '../../api/qa-client'
import { expect, test } from '../fixtures'

// The provisioning routes the deployed tier cleans up with: reachable, guarded, and honest about
// what is not there.

test('the QA API authenticates, guards and answers', async ({ qaApi, request, target }) => {
    const anonymous = createQaClient(request, 'not-a-token')
    expect((await anonymous.deleteStudy('00000000-0000-7000-8000-000000000000')).status()).toBe(401)

    const unknown = await qaApi.deleteStudy('00000000-0000-7000-8000-000000000000')
    expect(unknown.status(), await unknown.text()).toBe(404)

    // The guard is on the target's address, so a real-looking invitee is refused before anything is written.
    const refused = await qaApi.invite({
        email: `real-person-${Date.now().toString(36)}@example.com`,
        orgSlug: process.env.E2E_LAB_SLUG ?? 'openstax-lab',
    })
    expect(refused.status(), await refused.text()).toBe(403)

    expect(target.baseURL).toBeTruthy()
})
