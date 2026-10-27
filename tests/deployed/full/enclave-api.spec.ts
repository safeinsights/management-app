import { createEnclaveClient } from '../../api/enclave-client'
import { expect, test } from '../fixtures'

// Dev's seed gives the `openstax` org the committed test key, so a token signed with
// tests/support/private_key.pem is what the real enclave presents there. Staging, Production and
// Demo hold their own keys and must refuse it. PR previews share no known key and are left out.

test(
    "the job API answers a token signed with the environment's enclave key",
    { tag: '@api' },
    async ({ request, target }) => {
        test.skip(target.kind === 'pr', 'a PR preview holds no known enclave key')
        const response = await createEnclaveClient(request).readyStudies()
        if (target.accountsEnv !== 'qa') {
            expect(response.status(), 'only Dev holds the committed test key').toBe(401)
            return
        }
        if (response.status() === 401) {
            test.info().annotations.push({
                type: 'environment',
                description: 'the openstax org on Dev no longer carries the test key',
            })
            test.skip(true, 'the openstax org on Dev no longer carries the test key')
        }
        expect(response.status(), await response.text()).toBe(200)
        const body = JSON.parse(await response.text()) as { jobs: unknown[] }
        expect(Array.isArray(body.jobs)).toBe(true)
    },
)
