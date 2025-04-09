import { describe, it, vi } from 'vitest'

vi.mock('./actions', () => ({
    onCreateStudyAction: vi.fn(),
}))

describe('Member Start Page Form', () => {
    it('submits form', async () => {
        // TODO Fix this form
        // const { getByLabelText, getByRole, container } = renderWithProviders(
        //     <StudyProposalForm memberId="1234" memberSlug="hello-world" />,
        // )
        // let title = '2srt'
        //
        // const submitBtn = getByRole('button', { name: /next/i })
        // const description = 'this is a description'
        // const piName = 'i am the PI and also like PI'
        // await userEvent.type(getByLabelText(/description/i), description)
        // await userEvent.type(getByLabelText(/investigator/i), piName)
        //
        // const titleInput = getByLabelText(/title/i)
        // await userEvent.type(titleInput, title)
        // await userEvent.click(submitBtn)
        //
        // expect(container.querySelector('[class$="error"]')).not.toBeNull()
        //
        // expect(onCreateStudyAction).not.toHaveBeenCalled()
        // await userEvent.clear(titleInput)
        //
        // title = 'a long enough title to pass validation'
        // await userEvent.type(titleInput, title)
        //
        // await userEvent.click(submitBtn)
        //
        // expect(onCreateStudyAction).toHaveBeenCalledWith('1234', { title, description, piName })
    })
})
