import { describe, expect, it, vi } from 'vitest'
import { Form } from './form'
import userEvent from '@testing-library/user-event'

import { onCreateStudyAction } from './actions'
import { renderWithProviders } from '@/tests/unit.helpers'

vi.mock('./actions', () => ({
    onCreateStudyAction: vi.fn(),
}))

describe('Member Start Page Form', () => {
    it('submits form', async () => {
        const { getByLabelText, getByRole, container } = renderWithProviders(
            <Form memberId="1234" memberIdentifier="hello-world" />,
        )
        let title = '2srt'

        const submitBtn = getByRole('button', { name: /submit/i })
        const description = 'this is a description'
        const piName = 'i am the PI and also like PI'
        await userEvent.type(getByLabelText(/description/i), description)
        await userEvent.type(getByLabelText(/investigator/i), piName)

        const titleInput = getByLabelText(/title/i)
        await userEvent.type(titleInput, title)
        await userEvent.click(submitBtn)

        expect(container.querySelector('[class$="error"]')).not.toBeNull()

        expect(onCreateStudyAction).not.toHaveBeenCalled()
        await userEvent.clear(titleInput)

        title = 'a long enough title to pass validation'
        await userEvent.type(titleInput, title)

        await userEvent.click(submitBtn)

        expect(onCreateStudyAction).toHaveBeenCalledWith('1234', { title, description, piName })
    })
})
