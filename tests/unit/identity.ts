import { faker } from '@faker-js/faker'

export const BLANK_UUID = '00000000-0000-0000-0000-000000000000'

// faker.internet.email() draws from ~1.9M addresses, narrow enough that a full run repeats one
// and user_email_lower_unique rejects the insert. The counter and token make them unique.
let emailSequence = 0
const emailWorkerToken = faker.string.alphanumeric({ length: 6, casing: 'lower' })

export const testEmail = (provider = 'test.com') => {
    const [localPart] = faker.internet.email({ provider }).split('@')
    return `${localPart}-${emailWorkerToken}${++emailSequence}@${provider}`
}

// The /api/qa routes run on production and act only on "qa"-prefixed emails (see assertQaEmail).
export const qaEmail = () => `qa-${faker.string.alpha(10).toLowerCase()}@test.com`
