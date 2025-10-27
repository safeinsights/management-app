import {
    describe,
    it,
    expect,
    beforeEach,
    screen,
    fireEvent,
    waitFor,
    mockSessionWithTestData,
    faker,
    db,
    renderWithProviders,
} from '@/tests/unit.helpers'
import { Selectable } from 'kysely'
import { BaseImages } from './base-images'
import { Org } from '@/database/types'
import userEvent from '@testing-library/user-event'

describe('BaseImages', async () => {
    let org: Selectable<Org>

    beforeEach(async () => {
        const { org: createdOrg } = await mockSessionWithTestData({ isAdmin: true, orgSlug: faker.string.alpha(10) })
        org = createdOrg
    })

    it('renders empty state', async () => {
        renderWithProviders(<BaseImages />)
        await waitFor(async () => {
            expect(screen.getByText(/no base images available/i)).toBeTruthy()
        })
    })

    it('renders base images when they are present', async () => {
        await db
            .insertInto('orgBaseImage')
            .values({
                name: 'R Base Image 1',
                language: 'R',
                cmdLine: 'Rscript %f',
                url: 'http://example.com/r-base-1',
                isTesting: false,
                orgId: org.id,
            })
            .executeTakeFirstOrThrow()

        renderWithProviders(<BaseImages />)
        await waitFor(() => {
            expect(screen.getByText('R Base Image 1')).toBeInTheDocument()
        })
        expect(screen.getByRole('button', { name: /add image/i })).toBeInTheDocument()
    })

    it('opens the modal and creates an image that is displayed in table', async () => {
        renderWithProviders(<BaseImages />)

        const addButton = screen.getByRole('button', { name: /Add Image/i })
        fireEvent.click(addButton)

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Add New Base Image/i })).toBeInTheDocument()
        })

        const imageName = faker.hacker.noun() + ' Base Image'
        await userEvent.type(screen.getByLabelText(/Name/i), imageName)
        await userEvent.type(screen.getByLabelText(/Command Line/i), 'Rscript %f')
        await userEvent.type(screen.getByPlaceholderText(/harbor\.safeinsights/i), 'example.com/test-image:tag-1234')
        await userEvent.click(screen.getByRole('button', { name: /Save Image/i }))

        await waitFor(() => {
            expect(screen.getByText(imageName)).toBeInTheDocument()
        })
    })
})
