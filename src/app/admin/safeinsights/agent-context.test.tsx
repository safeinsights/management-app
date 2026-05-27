import { describe, expect, it, beforeEach, vi } from 'vitest'
import { db, mockSessionWithTestData, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { notifications } from '@mantine/notifications'
import { AgentContext } from './agent-context'

describe('AgentContext', () => {
    beforeEach(async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await db.deleteFrom('agentContext').execute()
    })

    it('renders a form for each context name with existing content from the DB', async () => {
        await db
            .insertInto('agentContext')
            .values({ name: 'SYSTEM', content: 'existing system context', orgId: null })
            .execute()

        renderWithProviders(<AgentContext />)

        const textarea = await screen.findByLabelText('System context')
        expect(textarea).toHaveValue('existing system context')
        expect(await screen.findByLabelText('R context')).toHaveValue('')
        expect(await screen.findByLabelText('Python context')).toHaveValue('')
    })

    it('shows a success notification after saving', async () => {
        const showSpy = vi.spyOn(notifications, 'show')
        renderWithProviders(<AgentContext />)

        const textarea = await screen.findByLabelText('System context')
        await userEvent.type(textarea, 'new content')

        const submitButton = (await screen.findAllByRole('button', { name: 'Submit' }))[0]
        await userEvent.click(submitButton)

        await waitFor(() => {
            expect(showSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    color: 'green',
                    title: 'Context saved',
                    message: 'Updated System context.',
                }),
            )
        })

        showSpy.mockRestore()
    })

    it('saves content to the DB on submit', async () => {
        renderWithProviders(<AgentContext />)

        const textarea = await screen.findByLabelText('System context')
        await userEvent.type(textarea, 'fresh content')

        const submitButton = (await screen.findAllByRole('button', { name: 'Submit' }))[0]
        await userEvent.click(submitButton)

        await waitFor(async () => {
            const row = await db
                .selectFrom('agentContext')
                .select(['name', 'content'])
                .where('name', '=', 'SYSTEM')
                .executeTakeFirst()
            expect(row?.content).toBe('fresh content')
        })
    })
})
