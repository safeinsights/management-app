import { describe, expect, it } from '@/tests/unit.helpers'
import { ROLE_FIXTURES } from './fixtures'
import { buildFakeUser } from './user-resource'

describe('buildFakeUser', () => {
    it('issues recovery codes from both enrollments to a user without any', async () => {
        const user = buildFakeUser(ROLE_FIXTURES.researcher)
        const phone = await user.createPhoneNumber({ phoneNumber: '+12015550123' })

        expect((await user.verifyTOTP()).backupCodes).toHaveLength(3)
        expect((await phone.setReservedForSecondFactor()).backupCodes).toHaveLength(3)
    })

    it('issues no recovery codes to a user who already has them', async () => {
        const user = buildFakeUser({ ...ROLE_FIXTURES.researcher, backupCodeEnabled: true })
        const phone = await user.createPhoneNumber({ phoneNumber: '+12015550123' })

        expect(user.backupCodeEnabled).toBe(true)
        expect(await user.verifyTOTP()).toEqual({ verified: true })
        expect(await phone.setReservedForSecondFactor()).toEqual({})
    })
})
