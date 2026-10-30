import router from 'next-router-mock'
import {
    beforeEach,
    describe,
    expect,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import BackupCodes from './backup-codes'

describe('BackupCodes', () => {
    beforeEach(() => {
        router.setCurrentUrl('/account/mfa/app')
    })

    it('asks for confirmation before leaving when the codes were not copied', async () => {
        const user = userEvent.setup()
        await mockSessionWithTestData({ orgType: 'lab' })
        renderWithProviders(<BackupCodes isVisible codes={['code-1', 'code-2']} />)

        await user.click(screen.getByRole('button', { name: 'Go to SafeInsights' }))

        expect(await screen.findByText('Have you stored your MFA recovery codes?')).toBeDefined()
        expect(router.asPath).toBe('/account/mfa/app')

        const confirm = screen.getAllByRole('button', { name: 'Go to SafeInsights' }).at(-1)!
        await user.click(confirm)

        await waitFor(() => expect(router.asPath).toBe('/dashboard'))
    })

    it('goes straight to the dashboard once the codes are copied', async () => {
        const user = userEvent.setup()
        await mockSessionWithTestData({ orgType: 'lab' })
        renderWithProviders(<BackupCodes isVisible codes={['code-1', 'code-2']} />)

        await user.click(screen.getByRole('button', { name: 'Copy codes' }))
        await user.click(screen.getByRole('button', { name: 'Go to SafeInsights' }))

        await waitFor(() => expect(router.asPath).toBe('/dashboard'))
        expect(screen.queryByText('Have you stored your MFA recovery codes?')).toBeNull()
    })

    it('says the existing codes still work and leaves without confirmation when there are no new codes', async () => {
        const user = userEvent.setup()
        await mockSessionWithTestData({ orgType: 'lab' })
        renderWithProviders(<BackupCodes isVisible codes={[]} />)

        expect(
            screen.getByText(
                'Your existing recovery codes still work. Use one of them if you lose access to your authentication device.',
            ),
        ).toBeDefined()
        expect(screen.queryByRole('button', { name: 'Copy codes' })).toBeNull()
        expect(screen.queryByText('Generating recovery codes...')).toBeNull()

        await user.click(screen.getByRole('button', { name: 'Go to SafeInsights' }))

        await waitFor(() => expect(router.asPath).toBe('/dashboard'))
        expect(screen.queryByText('Have you stored your MFA recovery codes?')).toBeNull()
    })

    it('renders nothing when not visible', async () => {
        await mockSessionWithTestData({ orgType: 'lab' })
        renderWithProviders(<BackupCodes isVisible={false} codes={['code-1']} />)

        expect(screen.queryByText('code-1')).toBeNull()
    })
})
