import { describe, expect, it, beforeEach } from 'vitest'
import { db, mockSessionWithTestData, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { ClaudeContext } from './claude-context'

describe('ClaudeContext', () => {
    beforeEach(async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await db.deleteFrom('claudeContext').execute()
    })

    it('renders a form for each context name with existing content from the DB', async () => {
        await db
            .insertInto('claudeContext')
            .values({ name: 'SYSTEM', content: 'existing system context', orgId: null })
            .execute()

        renderWithProviders(<ClaudeContext />)

        const textarea = await screen.findByLabelText('System context')
        expect(textarea).toHaveValue('existing system context')
        expect(await screen.findByLabelText('R context')).toHaveValue('')
        expect(await screen.findByLabelText('Python context')).toHaveValue('')
    })

    it('disables the Submit button until content has changed', async () => {
        renderWithProviders(<ClaudeContext />)

        const submitButtons = await screen.findAllByRole('button', { name: 'Submit' })
        expect(submitButtons[0]).toBeDisabled()

        const textarea = await screen.findByLabelText('System context')
        await userEvent.type(textarea, 'new system content')

        expect(submitButtons[0]).not.toBeDisabled()
    })

    it('saves content to the DB on submit', async () => {
        renderWithProviders(<ClaudeContext />)

        const textarea = await screen.findByLabelText('System context')
        await userEvent.type(textarea, 'fresh content')

        const submitButton = (await screen.findAllByRole('button', { name: 'Submit' }))[0]
        await userEvent.click(submitButton)

        await waitFor(async () => {
            const row = await db
                .selectFrom('claudeContext')
                .selectAll()
                .where('name', '=', 'SYSTEM')
                .executeTakeFirst()
            expect(row?.content).toBe('fresh content')
        })
    })
})
