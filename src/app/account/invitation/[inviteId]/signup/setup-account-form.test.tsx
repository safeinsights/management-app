import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { useSignIn } from '@clerk/nextjs'
import {
    actionResult,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    userEvent,
} from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { SetupAccountForm } from './setup-account-form'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const { fetchFileContents } = vi.hoisted(() => ({ fetchFileContents: vi.fn() }))

vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents,
}))

const TERMS_BODY = 'The published terms.'

beforeEach(async () => {
    ;(useSignIn as Mock).mockReturnValue({ isLoaded: true, signIn: null, setActive: null })
    await resetLegalDocuments()
})

const publishTos = async () => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(await createLegalDocumentDraftAction({ type: 'TOS', fileName: 'terms.md' }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
}

const renderForm = () =>
    renderWithProviders(<SetupAccountForm inviteId="an-invite" email="invitee@test.com" orgName="Openstax Lab" />)

const fillValidForm = async () => {
    await userEvent.type(screen.getByLabelText('First name'), 'Test')
    await userEvent.type(screen.getByLabelText('Last name'), 'User')
    await userEvent.type(screen.getByLabelText('Enter password'), 'Testing1234!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Testing1234!')
    await userEvent.click(screen.getByRole('checkbox'))
}

const createAccountButton = () => screen.getByRole('button', { name: 'Create Account' })

describe('SetupAccountForm legal documents', () => {
    it('shows the published documents and lets a completed form through', async () => {
        fetchFileContents.mockImplementation(async () => new Blob([TERMS_BODY]))
        await publishTos()

        renderForm()

        expect(await screen.findByText(TERMS_BODY)).toBeDefined()
        await fillValidForm()

        await waitFor(() => expect(createAccountButton()).toBeEnabled())
    })

    // Empty documents fall back to a placeholder that contradicts what is published, so a tick
    // against it must not create an account.
    it('refuses to submit when the documents cannot be loaded, and says so', async () => {
        fetchFileContents.mockImplementation(async () => {
            throw new Error('S3 is unavailable')
        })
        await publishTos()

        renderForm()

        expect(await screen.findByText(/Could not load the Terms of Service and Privacy Notice/)).toBeDefined()
        await fillValidForm()

        expect(createAccountButton()).toBeDisabled()
    })
})
