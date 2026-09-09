import { describe, expect, it, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { screen } from '@testing-library/react'
import {
    actionResult,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    testUploadFile,
} from '@/tests/unit.helpers'
import { createLegalDocumentDraftAction } from '@/server/actions/legal-document.actions'
import { PreviewDocument } from './preview-document'

vi.mock('@/server/aws', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/aws')>()),
    storeS3File: vi.fn(),
}))

// Mocking `@/server/aws` does not reach storage's own import of it.
vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents: vi.fn(async () => new Blob(['# Terms of Service'])),
}))

describe('PreviewDocument', () => {
    it('renders the stored markdown', async () => {
        await resetLegalDocuments()
        await mockSessionWithTestData({ isSiAdmin: true })
        const { version } = actionResult(
            await createLegalDocumentDraftAction({ type: 'TOS', file: testUploadFile('terms.md') }),
        )

        renderWithProviders(<PreviewDocument versionId={version.id} label="Terms of Service" />)

        expect(await screen.findByRole('heading', { name: 'Terms of Service' })).toBeDefined()
    })

    it('surfaces an error when the version cannot be read', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<PreviewDocument versionId={uuidv7()} label="Terms of Service" />)

        expect(await screen.findByText('An error occurred')).toBeDefined()
    })
})
