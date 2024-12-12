import { expect, describe, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Form } from './form'
import { TestingProvidersWrapper } from '@/tests/providers'
import userEvent from '@testing-library/user-event'

import { onCreateStudyAction } from './actions'

vi.mock('./actions', () => ({
    onCreateStudyAction: vi.fn(),
}))

describe('Member Start Page Form', () => {
    it('submits form', async () => {
        const { getByLabelText, getByRole, container } = render(
            <Form memberId="1234" memberIdentifier="hello-world" />,
            TestingProvidersWrapper,
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
        userEvent.clear(titleInput)

        title = 'a long enough title to pass validation'
        await userEvent.type(titleInput, title)

        await userEvent.click(submitBtn)

        expect(onCreateStudyAction).toHaveBeenCalledWith('1234', { title, description, piName })
    })
})
