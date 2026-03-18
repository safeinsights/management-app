import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StudyOrgSelector } from './study-org-selector'
import { FC } from 'react'
import { useUser } from '@clerk/nextjs'
import { TestingProviders, useTestStudyProposalForm } from '@/tests/providers'

vi.mock('@/server/actions/org.actions', () => ({
    getStudyCapableEnclaveOrgsAction: vi.fn(() =>
        Promise.resolve([
            { slug: 'test-org', name: 'Test Organization' },
            { slug: 'another-org', name: 'Another Organization' },
        ]),
    ),
}))

interface FormWrapperProps {
    orgSlug?: string
}

const FormWrapper: FC<FormWrapperProps> = ({ orgSlug = '' }) => {
    const form = useTestStudyProposalForm({ orgSlug })

    return (
        <TestingProviders>
            <StudyOrgSelector form={form} />
        </TestingProviders>
    )
}

describe('StudyOrgSelector', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useUser).mockReturnValue({
            user: { id: 'user-1', publicMetadata: {}, unsafeMetadata: {} },
            isLoaded: true,
        } as ReturnType<typeof useUser>)
    })

    it('renders step indicator as "Step 1A"', async () => {
        render(<FormWrapper />)

        await waitFor(() => {
            expect(screen.getByText(/step 1a/i)).toBeInTheDocument()
        })
    })

    it('renders title as "Data organization"', async () => {
        render(<FormWrapper />)

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Data organization' })).toBeInTheDocument()
        })
    })
})
