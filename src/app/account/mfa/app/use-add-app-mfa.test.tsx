import { useReverification, useUser } from '@clerk/nextjs'
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
import { useAddAppMfa } from './use-add-app-mfa'

const TOTP_URI = 'otpauth://totp/SafeInsights:me?secret=JBSWY3DPEHPK3PXP&issuer=SafeInsights'

const mockTotpUser = ({ backupCodeEnabled = false } = {}) => {
    const user = {
        id: 'user-1',
        backupCodeEnabled,
        createTOTP: vi.fn().mockResolvedValue({ uri: TOTP_URI }),
        verifyTOTP: vi.fn().mockResolvedValue(undefined),
        createBackupCode: vi.fn().mockResolvedValue({ codes: ['code-1', 'code-2'] }),
    }
    ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: true, user })
    ;(useReverification as Mock).mockImplementation((fn: unknown) => fn)
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

    it('moves to the success step with fresh backup codes after a valid code', async () => {
        const user = mockTotpUser()
        const { result } = renderAppMfa()

        await act(() => result.current.verifyTotp({ code: '123456' }))

        expect(user.verifyTOTP).toHaveBeenCalledWith({ code: '123456' })
        expect(result.current.step).toBe('success')
        expect(result.current.backupCodes).toEqual(['code-1', 'code-2'])
    })

    it('does not regenerate backup codes the user already has', async () => {
        const user = mockTotpUser({ backupCodeEnabled: true })
        const { result } = renderAppMfa()

        await act(() => result.current.verifyTotp({ code: '123456' }))

        expect(user.createBackupCode).not.toHaveBeenCalled()
        expect(result.current.step).toBe('success')
    })

    it('stays on the add step with an error for a rejected code', async () => {
        const user = mockTotpUser()
        user.verifyTOTP.mockRejectedValue(new Error('bad code'))
        const { result } = renderAppMfa()

        await act(() => result.current.verifyTotp({ code: '000000' }))

        expect(result.current.step).toBe('add')
        expect(result.current.form.errors.code).toBe('Invalid verification code. Please try again.')
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
