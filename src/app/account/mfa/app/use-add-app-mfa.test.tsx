import { useUser } from '@clerk/nextjs'
import {
    act,
    afterEach,
    createTestQueryWrapper,
    describe,
    expect,
    it,
    renderHook,
    vi,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import logger from '@/lib/logger'
import { useAddAppMfa } from './use-add-app-mfa'

const TOTP_URI = 'otpauth://totp/SafeInsights:me?secret=JBSWY3DPEHPK3PXP&issuer=SafeInsights'

const mockTotpUser = ({ backupCodeEnabled = false } = {}) => {
    const user = {
        id: 'user-1',
        backupCodeEnabled,
        createTOTP: vi.fn().mockResolvedValue({ uri: TOTP_URI }),
        verifyTOTP: vi.fn().mockResolvedValue({ verified: true, backupCodes: ['code-1', 'code-2'] }),
        createBackupCode: vi.fn(),
    }
    ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: true, user })
    return user
}

const renderAppMfa = () => renderHook(() => useAddAppMfa(), { wrapper: createTestQueryWrapper() })

describe('useAddAppMfa', () => {
    afterEach(() => vi.useRealTimers())

    it('creates one TOTP secret on load and exposes its key', async () => {
        const user = mockTotpUser()
        const { result, rerender } = renderAppMfa()

        await waitFor(() => expect(result.current.secret).toBe('JBSWY3DPEHPK3PXP'))
        rerender()

        expect(user.createTOTP).toHaveBeenCalledTimes(1)
        expect(result.current.totpUri).toBe(TOTP_URI)
    })

    it('shows the backup codes that verifying the first code returns', async () => {
        const user = mockTotpUser()
        const { result } = renderAppMfa()

        await act(() => result.current.verifyTotp({ code: '123456' }))

        expect(user.verifyTOTP).toHaveBeenCalledWith({ code: '123456' })
        expect(user.createBackupCode).not.toHaveBeenCalled()
        expect(result.current.step).toBe('success')
        expect(result.current.enrolled).toEqual({ codes: ['code-1', 'code-2'], hasExistingCodes: false })
    })

    it('finishes with no codes when the user already has backup codes', async () => {
        const user = mockTotpUser({ backupCodeEnabled: true })
        user.verifyTOTP.mockResolvedValue({ verified: true })
        const logError = vi.spyOn(logger, 'error')
        const { result } = renderAppMfa()

        await act(() => result.current.verifyTotp({ code: '123456' }))

        expect(user.createBackupCode).not.toHaveBeenCalled()
        expect(result.current.step).toBe('success')
        expect(result.current.enrolled).toEqual({ codes: [], hasExistingCodes: true })
        expect(logError).not.toHaveBeenCalled()
    })

    it('reports a first enrollment that returns no codes', async () => {
        const user = mockTotpUser()
        user.verifyTOTP.mockResolvedValue({ verified: true })
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const { result } = renderAppMfa()

        await act(() => result.current.verifyTotp({ code: '123456' }))

        expect(result.current.step).toBe('success')
        expect(result.current.enrolled).toEqual({ codes: [], hasExistingCodes: false })
        expect(logError).toHaveBeenCalled()
    })

    it('stays on the add step with an error for a rejected code', async () => {
        const user = mockTotpUser()
        user.verifyTOTP.mockRejectedValue({ errors: [{ code: 'form_code_incorrect', message: 'Incorrect code' }] })
        const logError = vi.spyOn(logger, 'error')
        const { result } = renderAppMfa()

        await act(() => result.current.verifyTotp({ code: '000000' }))

        expect(result.current.step).toBe('add')
        expect(result.current.form.errors.code).toBe('Invalid verification code. Please try again.')
        expect(logError).not.toHaveBeenCalled()
    })

    it('logs a verification failure that is not a wrong code', async () => {
        const user = mockTotpUser()
        const failure = new Error('network down')
        user.verifyTOTP.mockRejectedValue(failure)
        const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
        const { result } = renderAppMfa()

        await act(() => result.current.verifyTotp({ code: '000000' }))

        expect(result.current.step).toBe('add')
        expect(result.current.form.errors.code).toBe('network down')
        expect(logError).toHaveBeenCalledWith('Error verifying TOTP', failure)
    })

    it('blocks regenerating the QR code for 30 seconds', async () => {
        vi.useFakeTimers()
        const user = mockTotpUser()
        const { result } = renderAppMfa()

        await act(() => result.current.regenerate())
        expect(result.current.canRegenerate).toBe(false)

        await act(() => vi.advanceTimersByTimeAsync(30000))

        expect(result.current.canRegenerate).toBe(true)
        expect(user.createTOTP).toHaveBeenCalledTimes(2)
    })
})
