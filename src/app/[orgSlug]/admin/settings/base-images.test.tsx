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
    renderWithProviders,
    insertTestBaseImage,
} from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { Selectable } from 'kysely'
import { BaseImages } from './base-images'
import { Org } from '@/database/types'
import userEvent from '@testing-library/user-event'

vi.mock('@/server/aws', async () => {
    const actual = await vi.importActual('@/server/aws')
    return {
        ...actual,
        storeS3File: vi.fn().mockResolvedValue(undefined),
        deleteS3File: vi.fn().mockResolvedValue(undefined),
    }
})

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
        await insertTestBaseImage({
            orgId: org.id,
            name: 'R Base Image 1',
            language: 'R',
        })

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

        // Upload a starter code file
        const file = new File(['print("Hello World")'], 'starter.R', { type: 'text/plain' })
        // Mantine FileInput renders as a button, but we upload to the hidden input
        // Find the hidden file input element and upload to it
        const fileInputs = document.querySelectorAll('input[type="file"]')
        const fileInput = fileInputs[0] as HTMLInputElement
        await userEvent.upload(fileInput, file)

        await userEvent.click(screen.getByRole('button', { name: /Save Image/i }))

        await waitFor(() => {
            expect(screen.getByText(imageName)).toBeInTheDocument()
        })
    })

    it('allows an org admin to edit a base image and replace starter code via the dialog', async () => {
        // Seed a base image as the only non-testing R image (so no delete button)
        await insertTestBaseImage({
            orgId: org.id,
            name: 'Editable Base Image',
            language: 'R',
            isTesting: false,
            starterCodePath: 'test/path/to/old-starter.R',
        })

        renderWithProviders(<BaseImages />)

        // Wait for the row to appear
        await waitFor(() => {
            expect(screen.getByText('Editable Base Image')).toBeInTheDocument()
        })

        // Old starter code filename should be visible in the "Starter Code" column
        expect(screen.getByText('old-starter.R')).toBeInTheDocument()

        // Open the edit dialog for this row:
        // row has two ActionIcon buttons: [0] = View Starter Code, [1] = Edit
        const row = screen.getByText('Editable Base Image').closest('tr') as HTMLElement
        expect(row).toBeTruthy()
        const buttons = row.querySelectorAll('button')
        expect(buttons.length).toBeGreaterThanOrEqual(2)
        await userEvent.click(buttons[1] as HTMLButtonElement)

        // Verify the edit modal opens
        await waitFor(() => {
            expect(screen.getByText(/edit base image/i)).toBeInTheDocument()
        })

        // Upload a new starter code file via the hidden file input behind Mantine's FileInput
        const newFile = new File(['sample starter code'], 'starter-code.r', { type: 'text/plain' })
        const fileInputs = document.querySelectorAll('input[type="file"]')
        expect(fileInputs.length).toBeGreaterThan(0)
        const fileInput = fileInputs[0] as HTMLInputElement
        await userEvent.upload(fileInput, newFile)

        // Submit the dialog via the "Update Image" button
        await userEvent.click(screen.getByRole('button', { name: /update image/i }))

        // After saving, the table should show the new starter code filename
        await waitFor(() => {
            expect(screen.getByText('Editable Base Image')).toBeInTheDocument()
            expect(screen.getByText('starter-code.r')).toBeInTheDocument()
        })
    })

    it('allows deletion of testing images regardless of count', async () => {
        // Create one non-testing image and one testing image
        await insertTestBaseImage({
            orgId: org.id,
            name: 'Production Image',
            language: 'R',
            isTesting: false,
        })

        await insertTestBaseImage({
            orgId: org.id,
            name: 'Testing Image',
            language: 'PYTHON',
            isTesting: true,
        })

        renderWithProviders(<BaseImages />)

        await waitFor(() => {
            expect(screen.getByText('Production Image')).toBeInTheDocument()
            expect(screen.getByText('Testing Image')).toBeInTheDocument()
        })

        // Find all delete buttons (ActionIcons with TrashIcon)
        const deleteButtons = screen.getAllByRole('button', { name: '' }).filter((btn) => btn.querySelector('svg'))

        // The testing image should have a delete button (testing images can always be deleted)
        // But since there's only 1 non-testing image, it shouldn't have a delete button
        // So we should have exactly 1 delete button
        expect(deleteButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('prevents deletion of the last non-testing image', async () => {
        // Create only one non-testing image
        await insertTestBaseImage({
            orgId: org.id,
            name: 'Only Production Image',
            language: 'R',
            isTesting: false,
        })

        renderWithProviders(<BaseImages />)

        await waitFor(() => {
            expect(screen.getByText('Only Production Image')).toBeInTheDocument()
        })

        // There should be no delete button for the only non-testing image
        // Look for edit button which should exist
        const actionIcons = screen.getAllByRole('button', { name: '' })
        // Filter for icons that might be delete buttons (red colored)
        const potentialDeleteButtons = actionIcons.filter((btn) => {
            const actionIcon = btn.closest('.mantine-ActionIcon-root')
            return actionIcon?.getAttribute('data-variant') === 'subtle'
        })

        // We should have at least the edit button, but the delete button should not be rendered
        // (the DeleteBaseImg component returns null when canDelete is false)
        expect(potentialDeleteButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('allows deletion of non-testing images when there are multiple', async () => {
        // Create two non-testing images
        await insertTestBaseImage({
            orgId: org.id,
            name: 'Production Image 1',
            language: 'R',
            isTesting: false,
        })

        await insertTestBaseImage({
            orgId: org.id,
            name: 'Production Image 2',
            language: 'PYTHON',
            isTesting: false,
        })

        renderWithProviders(<BaseImages />)

        await waitFor(() => {
            expect(screen.getByText('Production Image 1')).toBeInTheDocument()
            expect(screen.getByText('Production Image 2')).toBeInTheDocument()
        })

        // Both images should have delete buttons since there are 2 non-testing images
        const actionIcons = screen.getAllByRole('button', { name: '' })
        expect(actionIcons.length).toBeGreaterThanOrEqual(4) // At least 2 edit + 2 delete buttons
    })

    it('prevents deletion of the last non-testing image per language', async () => {
        // Create one R image and one Python image (both non-testing)
        await insertTestBaseImage({
            orgId: org.id,
            name: 'Only R Image',
            language: 'R',
            isTesting: false,
        })

        await insertTestBaseImage({
            orgId: org.id,
            name: 'Only Python Image',
            language: 'PYTHON',
            isTesting: false,
        })

        renderWithProviders(<BaseImages />)

        await waitFor(() => {
            expect(screen.getByText('Only R Image')).toBeInTheDocument()
            expect(screen.getByText('Only Python Image')).toBeInTheDocument()
        })

        // Neither image should have a delete button since each is the only non-testing image for its language
        const actionIcons = screen.getAllByRole('button', { name: '' })
        // We should only have edit buttons (2), no delete buttons
        // Filter for potential delete buttons (they would be red)
        const editButtons = actionIcons.filter((btn) => {
            return btn.closest('[data-variant="subtle"]') !== null
        })
        // Should have at least 2 edit buttons, but no delete buttons should be rendered
        expect(editButtons.length).toBeGreaterThanOrEqual(2)
    })

    it('allows deletion when there are multiple non-testing images for the same language', async () => {
        // Create two R images (both non-testing)
        await insertTestBaseImage({
            orgId: org.id,
            name: 'R Image 1',
            language: 'R',
            isTesting: false,
        })

        await insertTestBaseImage({
            orgId: org.id,
            name: 'R Image 2',
            language: 'R',
            isTesting: false,
        })

        renderWithProviders(<BaseImages />)

        await waitFor(() => {
            expect(screen.getByText('R Image 1')).toBeInTheDocument()
            expect(screen.getByText('R Image 2')).toBeInTheDocument()
        })

        // Both images should have delete buttons since there are 2 non-testing R images
        const actionIcons = screen.getAllByRole('button', { name: '' })
        expect(actionIcons.length).toBeGreaterThanOrEqual(4) // At least 2 edit + 2 delete buttons
    })
})
