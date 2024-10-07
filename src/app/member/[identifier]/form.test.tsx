import { expect, describe, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Form } from './form'
import { TestingProviders } from '../../providers'
import userEvent from '@testing-library/user-event'

import { onSubmitAction } from './actions'

vi.mock('./actions', () => ({
    onSubmitAction: vi.fn(),
}))

describe('Member Start Page Form', () => {
    it('submits form', async () => {
        const { getByLabelText, getByRole } = render(<Form />, { wrapper: TestingProviders })
        const input = getByLabelText(/study/)
        await userEvent.type(input, '2short')
        expect(onSubmitAction).not.toHaveBeenCalled()

        userEvent.clear(input)

        const title = 'hello world thing goes'

        await userEvent.type(input, title)

        await userEvent.click(getByRole('button', { name: /begin/i }))

        expect(onSubmitAction).toHaveBeenCalledWith({ title })
    })
})
