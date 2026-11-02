import { describe, expect, it, vi } from 'vitest'
import { insertTestStudyJobData, mockSessionWithTestData, renderWithProviders, screen } from '@/tests/unit.helpers'
import { latestJobForStudy } from '@/server/db/queries'
import { SecurityKeyForm } from './security-key-form'

// The key entry itself is covered by security-key-fields.test.tsx.
describe('SecurityKeyForm', () => {
    it('renders the key-entry section with a required indicator and body copy', async () => {
        const { org } = await mockSessionWithTestData()
        const { study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
        const job = await latestJobForStudy(study.id)
        renderWithProviders(<SecurityKeyForm job={job} onDecrypted={vi.fn()} />)

        await screen.findByRole('button', { name: 'View' })

        expect(screen.getByRole('heading', { name: /security key/i })).toBeInTheDocument()
        expect(screen.getByLabelText('required')).toHaveTextContent('*')
        expect(
            screen.getByText('This key is required to access the outputs. It was issued to you during sign-up.'),
        ).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'off')
        expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /lost your key/i })).toBeInTheDocument()
    })
})
