import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { useSignIn } from '@clerk/nextjs'
import { db } from '@/database'
import {
    actionResult,
    faker,
    insertTestOrg,
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

// Need a real invite in the db in order to retrieve ROPA/DOPA docs
const createInvite = async (orgId: string) => {
    const { user } = await mockSessionWithTestData({ isSiAdmin: true })
    const invite = await db
        .insertInto('pendingUser')
        .values({
            orgId,
            email: faker.internet.email({ provider: 'test.com' }),
            isAdmin: false,
            invitedByUserId: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    return invite.id
}

const inviteWithParticipationAgreement = async () => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'ROPA', orgId: org.id, fileName: 'ropa.pdf' }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt: '2026-07-27' }))
    return await createInvite(org.id)
}

const inviteWithoutParticipationAgreement = async () => {
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    return await createInvite(org.id)
}

const renderForm = (inviteId: string) =>
    renderWithProviders(<SetupAccountForm inviteId={inviteId} email="invitee@test.com" orgName="Openstax Lab" />)

const fillNameAndPassword = async () => {
    await userEvent.type(screen.getByLabelText('First name'), 'Test')
    await userEvent.type(screen.getByLabelText('Last name'), 'User')
    await userEvent.type(screen.getByLabelText('Enter password'), 'Testing1234!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Testing1234!')
}

const fillValidForm = async () => {
    await fillNameAndPassword()
    for (const checkbox of screen.getAllByRole('checkbox')) {
        await userEvent.click(checkbox)
    }
}

const participationCheckbox = () =>
    screen.getByRole('checkbox', { name: /Research Organization Participation Agreement/ })

const createAccountButton = () => screen.getByRole('button', { name: 'Create Account' })

describe('SetupAccountForm legal documents', () => {
    it('shows the tos and the participation agreement, and lets a completed form through', async () => {
        fetchFileContents.mockImplementation(async () => new Blob([TERMS_BODY]))
        await publishTos()
        const inviteId = await inviteWithParticipationAgreement()

        renderForm(inviteId)

        expect(await screen.findByText(TERMS_BODY)).toBeDefined()
        // The participation agreement is a pdf, shown as a link the invitee agrees to.
        expect(await screen.findByRole('link', { name: 'Research Organization Participation Agreement' })).toBeDefined()
        await fillValidForm()

        await waitFor(() => expect(createAccountButton()).toBeEnabled())
    })

    it('lets a completed form through when the org has no participation agreement', async () => {
        fetchFileContents.mockImplementation(async () => new Blob([TERMS_BODY]))
        await publishTos()
        const inviteId = await inviteWithoutParticipationAgreement()

        renderForm(inviteId)

        expect(await screen.findByText(TERMS_BODY)).toBeDefined()
        expect(
            screen.queryByRole('link', { name: 'Research Organization Participation Agreement' }),
        ).not.toBeInTheDocument()
        await fillValidForm()

        await waitFor(() => expect(createAccountButton()).toBeEnabled())
    })

    // The conditional schema must relax the participation tick only for orgs that have no
    // agreement -- an org that has one is still owed it.
    it('blocks submission until an existing participation agreement is ticked', async () => {
        fetchFileContents.mockImplementation(async () => new Blob([TERMS_BODY]))
        await publishTos()
        const inviteId = await inviteWithParticipationAgreement()

        renderForm(inviteId)

        expect(await screen.findByText(TERMS_BODY)).toBeDefined()
        await fillNameAndPassword()
        await userEvent.click(screen.getByRole('checkbox', { name: /Terms of Service/ }))

        expect(createAccountButton()).toBeDisabled()

        await userEvent.click(participationCheckbox())
        await waitFor(() => expect(createAccountButton()).toBeEnabled())
    })

    // Empty documents fall back to a placeholder that contradicts what is published, so a tick
    // against it must not create an account.
    it('refuses to submit when the documents cannot be loaded, and says so', async () => {
        fetchFileContents.mockImplementation(async () => {
            throw new Error('S3 is unavailable')
        })
        await publishTos()
        const inviteId = await inviteWithoutParticipationAgreement()

        renderForm(inviteId)

        expect(await screen.findByText(/There was an error loading the document/)).toBeDefined()
        await fillValidForm()

        expect(createAccountButton()).toBeDisabled()
    })
})
