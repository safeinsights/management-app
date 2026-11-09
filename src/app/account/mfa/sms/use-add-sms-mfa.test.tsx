import { useReverification, useUser } from '@clerk/nextjs'
import { ClerkRuntimeError } from '@clerk/nextjs/errors'
import { notifications } from '@mantine/notifications'
import {
    act,
    afterEach,
    beforeEach,
    createTestQueryWrapper,
    describe,
    expect,
    it,
    renderHook,
    vi,
    type Mock,
} from '@/tests/unit.helpers'
import logger from '@/lib/logger'
import { useAddSmsMfa } from './use-add-sms-mfa'

const PHONE = '+12015550123'

const mockSmsUser = ({ verified = true, backupCodeEnabled = false } = {}) => {
    const phone = {
        id: 'phone-1',
        phoneNumber: PHONE,
        prepareVerification: vi.fn().mockResolvedValue(undefined),
        attemptVerification: vi.fn().mockResolvedValue({ verification: { status: verified ? 'verified' : 'failed' } }),
        setReservedForSecondFactor: vi
            .fn<() => Promise<{ backupCodes?: string[] }>>()
            .mockResolvedValue({ backupCodes: ['code-1', 'code-2'] }),
    }
    const user = {
        id: 'user-1',
        phoneNumbers: [] as (typeof phone)[],
        backupCodeEnabled,
        createPhoneNumber: vi.fn(async () => {
            user.phoneNumbers.push(phone)
            return phone
        }),
        createBackupCode: vi.fn(),
        reload: vi.fn().mockResolvedValue(undefined),
    }
    ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: true, user })
    ;(useReverification as Mock).mockImplementation((fn: unknown) => fn)
    return { user, phone }
}

const toastTitles = () => (notifications.show as Mock).mock.calls.map(([opts]) => opts.title)

const renderSmsMfa = () => renderHook(() => useAddSmsMfa(), { wrapper: createTestQueryWrapper() })

const sendCode = async (result: ReturnType<typeof renderSmsMfa>['result']) => {
    await act(async () => {
        const sending = result.current.sendVerificationCode({ phoneNumber: PHONE })
        await vi.advanceTimersByTimeAsync(3000)
        await sending
    })
}

describe('useAddSmsMfa', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        ;(notifications.show as Mock).mockClear()
    })
    afterEach(() => vi.useRealTimers())

    it('creates the phone number, sends a code and moves to the code step', async () => {
        const { user, phone } = mockSmsUser()
        const { result } = renderSmsMfa()
        expect(result.current.step).toBe('phone')

        await sendCode(result)

        expect(user.createPhoneNumber).toHaveBeenCalledWith({ phoneNumber: PHONE })
        expect(phone.prepareVerification).toHaveBeenCalled()
        expect(result.current.step).toBe('otp')
        expect(result.current.phoneLastFour).toBe('0123')
    })

    it('throttles a resend inside 30 seconds and confirms only a resend that went out', async () => {
        const { phone } = mockSmsUser()
        const { result } = renderSmsMfa()
        await sendCode(result)

        await act(() => result.current.resendCode())

        expect(toastTitles()).toContain(
            'You have recently requested a code. Please wait 30 seconds before trying again.',
        )
        expect(toastTitles()).not.toContain('A new code has been sent!')
        expect(phone.prepareVerification).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(30000)
        await act(async () => {
            const resending = result.current.resendCode()
            await vi.advanceTimersByTimeAsync(3000)
            await resending
        })

        expect(phone.prepareVerification).toHaveBeenCalledTimes(2)
        expect(toastTitles()).toContain('A new code has been sent!')
    })

    it('enables MFA on a verified code and shows the backup codes Clerk returns', async () => {
        const { user, phone } = mockSmsUser()
        const { result } = renderSmsMfa()
        await sendCode(result)

        await act(() => result.current.verifyCodeAndSetMfa({ code: '123456' }))

        expect(phone.setReservedForSecondFactor).toHaveBeenCalledWith({ reserved: true })
        expect(user.createBackupCode).not.toHaveBeenCalled()
        expect(result.current.step).toBe('backup')
        expect(result.current.enrolled).toEqual({ codes: ['code-1', 'code-2'], hasExistingCodes: false })
        expect(toastTitles()).toEqual(['MFA enabled'])
    })

    it('finishes on the backup step with no codes when the user already has backup codes', async () => {
        const { user, phone } = mockSmsUser({ backupCodeEnabled: true })
        phone.setReservedForSecondFactor.mockResolvedValue({})
        const logError = vi.spyOn(logger, 'error')
        const { result } = renderSmsMfa()
        await sendCode(result)

        await act(() => result.current.verifyCodeAndSetMfa({ code: '123456' }))

        expect(user.createBackupCode).not.toHaveBeenCalled()
        expect(result.current.step).toBe('backup')
        expect(result.current.enrolled).toEqual({ codes: [], hasExistingCodes: true })
        expect(toastTitles()).toEqual(['MFA enabled'])
        expect(logError).not.toHaveBeenCalled()
    })

    it('reports a first enrollment that returns no codes', async () => {
        const { phone } = mockSmsUser()
        phone.setReservedForSecondFactor.mockResolvedValue({})
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const { result } = renderSmsMfa()
        await sendCode(result)

        await act(() => result.current.verifyCodeAndSetMfa({ code: '123456' }))

        expect(result.current.step).toBe('backup')
        expect(result.current.enrolled).toEqual({ codes: [], hasExistingCodes: false })
        expect(logError).toHaveBeenCalled()
    })

    it('keeps the code step and does not enable MFA when the code is not verified', async () => {
        const { phone } = mockSmsUser({ verified: false })
        const { result } = renderSmsMfa()
        await sendCode(result)

        await act(() => result.current.verifyCodeAndSetMfa({ code: '000000' }))

        expect(phone.setReservedForSecondFactor).not.toHaveBeenCalled()
        expect(result.current.step).toBe('otp')
        expect(result.current.otpForm.errors.code).toBeTruthy()
    })

    it('logs a failure to enable MFA for the phone and stays on the code step', async () => {
        const { phone } = mockSmsUser()
        const failure = new Error('clerk down')
        phone.setReservedForSecondFactor.mockRejectedValue(failure)
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const { result } = renderSmsMfa()
        await sendCode(result)

        await act(() => result.current.verifyCodeAndSetMfa({ code: '123456' }))

        expect(result.current.step).toBe('otp')
        expect(result.current.otpForm.errors.code).toBe('Failed to enable MFA for this phone number')
        expect(logError).toHaveBeenCalledWith('Error enabling SMS MFA', failure)
    })

    it('does not log when the user cancels the Clerk reverification prompt', async () => {
        const { phone } = mockSmsUser()
        phone.setReservedForSecondFactor.mockRejectedValue(
            new ClerkRuntimeError('User cancelled attempted verification', { code: 'reverification_cancelled' }),
        )
        const logError = vi.spyOn(logger, 'error')
        const { result } = renderSmsMfa()
        await sendCode(result)

        await act(() => result.current.verifyCodeAndSetMfa({ code: '123456' }))

        expect(result.current.step).toBe('otp')
        expect(logError).not.toHaveBeenCalled()
    })
})
