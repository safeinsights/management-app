import {
    describe,
    it,
    expect,
    beforeEach,
    screen,
    waitFor,
    mockSessionWithTestData,
    faker,
    renderWithProviders,
    insertTestDataSource,
    userEvent,
    db,
} from '@/tests/unit.helpers'
import { Selectable } from 'kysely'
import { DataSources } from './data-sources'
import { Org } from '@/database/types'
import { within } from '@testing-library/react'

describe('DataSources', async () => {
    let org: Selectable<Org>

    beforeEach(async () => {
        const { org: createdOrg } = await mockSessionWithTestData({ isAdmin: true, orgSlug: faker.string.alpha(10) })
        org = createdOrg
    })

    it('renders with title, button, and appropriate message when there is no data', async () => {
        renderWithProviders(<DataSources />)
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Data Sources/i })).toBeInTheDocument()
            expect(screen.getByText(/No data sources available/i)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /Add Data Source/i })).toBeInTheDocument()
        })
    })

    it('renders data sources when available', async () => {
        await insertTestDataSource({
            orgId: org.id,
            name: 'Name: Data source 1',
            description: 'Desc: Data source 1',
            documents: [
                {
                    url: 'https://example.com/docs1',
                    description: 'Source 1 docs1 desc',
                },
                {
                    url: 'https://example.com/docs2',
                    description: 'Source 1 docs2 desc',
                },
            ],
        })
        renderWithProviders(<DataSources />)

        await waitFor(() => {
            expect(screen.getByText(/Name: Data source 1/i)).toBeInTheDocument()
            expect(screen.getByText(/Desc: Data source 1/i)).toBeInTheDocument()
            expect(screen.getByText(/Source 1 docs1 desc/i)).toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'https://example.com/docs1' })).toBeInTheDocument()
            expect(screen.getByText(/Source 1 docs2 desc/i)).toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'https://example.com/docs2' })).toBeInTheDocument()
        })
    })

    it('renders modal form to add a data source when button is clicked', async () => {
        const user = userEvent.setup()

        renderWithProviders(<DataSources />)

        await user.click(screen.getByRole('button', { name: /add data source/i }))

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Add Data Source/i })).toBeInTheDocument()
        })

        const modal = screen.getByRole('dialog')
        const modalQueries = within(modal)

        expect(modal).toHaveAttribute('aria-modal', 'true')

        expect(modalQueries.getByLabelText(/name/i)).toBeInTheDocument()
        expect(modalQueries.getByLabelText(/description/i)).toBeInTheDocument()
        expect(modalQueries.getByRole('heading', { name: /data source documents/i })).toBeInTheDocument()
        expect(modalQueries.getByPlaceholderText(/url for document/i)).toBeInTheDocument()
        expect(modalQueries.getByPlaceholderText(/description of document/i)).toBeInTheDocument()
        expect(modalQueries.getByRole('button', { name: /save data source/i })).toBeInTheDocument()
    })

    it('creates expected database rows on create form submission', async () => {
        const user = userEvent.setup()

        renderWithProviders(<DataSources />)

        await user.click(screen.getByRole('button', { name: /add data source/i }))

        const modal = await screen.findByRole('dialog')
        const modalQueries = within(modal)

        await user.type(modalQueries.getByLabelText(/name/i), 'My data source')
        await user.type(modalQueries.getByLabelText(/description/i), 'Description of my data source')

        await user.type(modalQueries.getByPlaceholderText(/url for document/i), 'https://example.com/doc')

        await user.type(modalQueries.getByPlaceholderText(/description of document/i), 'Document description')

        await user.click(modalQueries.getByRole('button', { name: /add document/i }))

        await user.click(modalQueries.getByRole('button', { name: /save data source/i }))

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })

        const sources = await db
            .selectFrom('orgDataSource')
            .select(['name', 'description'])
            .where('orgId', '=', org.id)
            .execute()
        expect(sources).toEqual([{ name: 'My data source', description: 'Description of my data source' }])

        const docs = await db
            .selectFrom('orgDataSourceDocument')
            .innerJoin('orgDataSource', 'orgDataSource.id', 'orgDataSourceDocument.orgDataSourceId')
            .select(['orgDataSourceDocument.url', 'orgDataSourceDocument.description'])
            .where('orgDataSource.orgId', '=', org.id)
            .execute()
        expect(docs).toEqual([{ url: 'https://example.com/doc', description: 'Document description' }])
    })

    it('renders modal form to edit a data source when edit button is clicked', async () => {
        const user = userEvent.setup()

        await insertTestDataSource({
            orgId: org.id,
            name: 'Existing source',
            description: 'Existing desc',
            documents: [{ url: 'https://example.com/existing-doc', description: 'Existing doc desc' }],
        })

        renderWithProviders(<DataSources />)

        await waitFor(() => {
            expect(screen.getByText('Existing source')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /edit data source/i }))

        const modal = await screen.findByRole('dialog')
        const modalQueries = within(modal)

        expect(modalQueries.getByRole('heading', { name: /edit data source/i })).toBeInTheDocument()
        expect(modalQueries.getByLabelText(/name/i)).toHaveValue('Existing source')
        expect(modalQueries.getByLabelText(/description/i)).toHaveValue('Existing desc')
        expect(modalQueries.getByDisplayValue('https://example.com/existing-doc')).toBeInTheDocument()
        expect(modalQueries.getByDisplayValue('Existing doc desc')).toBeInTheDocument()
        expect(modalQueries.getByRole('button', { name: /update data source/i })).toBeInTheDocument()
    })

    it('updates expected database rows on edit form submission', async () => {
        const user = userEvent.setup()

        const ds = await insertTestDataSource({
            orgId: org.id,
            name: 'Original name',
            description: 'Original desc',
            documents: [{ url: 'https://example.com/orig', description: 'Original doc desc' }],
        })

        renderWithProviders(<DataSources />)

        await waitFor(() => {
            expect(screen.getByText('Original name')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /edit data source/i }))

        const modal = await screen.findByRole('dialog')
        const modalQueries = within(modal)

        const nameInput = modalQueries.getByLabelText(/name/i)
        await user.clear(nameInput)
        await user.type(nameInput, 'Updated name')

        const descInput = modalQueries.getByLabelText(/description/i)
        await user.clear(descInput)
        await user.type(descInput, 'Updated desc')

        await user.click(modalQueries.getByRole('button', { name: /update data source/i }))

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })

        const sources = await db
            .selectFrom('orgDataSource')
            .select(['name', 'description'])
            .where('id', '=', ds.id)
            .execute()
        expect(sources).toEqual([{ name: 'Updated name', description: 'Updated desc' }])

        // Existing document is preserved unchanged through the update path
        const docs = await db
            .selectFrom('orgDataSourceDocument')
            .select(['url', 'description'])
            .where('orgDataSourceId', '=', ds.id)
            .execute()
        expect(docs).toEqual([{ url: 'https://example.com/orig', description: 'Original doc desc' }])
    })

    it('deletes expected database rows when delete button is clicked', async () => {
        const user = userEvent.setup()

        const ds = await insertTestDataSource({
            orgId: org.id,
            name: 'To delete',
            documents: [{ url: 'https://example.com/dd', description: 'Doomed doc' }],
        })

        renderWithProviders(<DataSources />)

        await waitFor(() => {
            expect(screen.getByText('To delete')).toBeInTheDocument()
        })

        await user.click(screen.getByRole('button', { name: /delete data source/i }))

        const confirmButton = await screen.findByRole('button', { name: /yes/i, hidden: true })
        await user.click(confirmButton)

        await waitFor(() => {
            expect(screen.queryByText('To delete')).not.toBeInTheDocument()
        })

        const sources = await db.selectFrom('orgDataSource').where('id', '=', ds.id).execute()
        expect(sources).toEqual([])

        const docs = await db.selectFrom('orgDataSourceDocument').where('orgDataSourceId', '=', ds.id).execute()
        expect(docs).toEqual([])
    })

    it('includes doc information if user does not click add document on save', async () => {
        const user = userEvent.setup()

        renderWithProviders(<DataSources />)

        await user.click(screen.getByRole('button', { name: /add data source/i }))

        const modal = await screen.findByRole('dialog')
        const modalQueries = within(modal)

        await user.type(modalQueries.getByLabelText(/name/i), 'Implicit doc source')
        await user.type(modalQueries.getByPlaceholderText(/url for document/i), 'https://example.com/implicit')
        await user.type(modalQueries.getByPlaceholderText(/description of document/i), 'Implicit doc desc')

        await user.click(modalQueries.getByRole('button', { name: /save data source/i }))

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        })

        const docs = await db
            .selectFrom('orgDataSourceDocument')
            .innerJoin('orgDataSource', 'orgDataSource.id', 'orgDataSourceDocument.orgDataSourceId')
            .select(['orgDataSourceDocument.url', 'orgDataSourceDocument.description'])
            .where('orgDataSource.orgId', '=', org.id)
            .execute()
        expect(docs).toEqual([{ url: 'https://example.com/implicit', description: 'Implicit doc desc' }])
    })

    it('includes doc information if user does not click add document on save but surfaces validation errors when invalid', async () => {
        const user = userEvent.setup()

        renderWithProviders(<DataSources />)

        await user.click(screen.getByRole('button', { name: /add data source/i }))

        const modal = await screen.findByRole('dialog')
        const modalQueries = within(modal)

        await user.type(modalQueries.getByLabelText(/name/i), 'Invalid doc source')
        await user.type(modalQueries.getByPlaceholderText(/url for document/i), 'not-a-url')

        await user.click(modalQueries.getByRole('button', { name: /save data source/i }))

        await waitFor(() => {
            expect(modalQueries.getByDisplayValue('not-a-url')).toHaveAttribute('aria-invalid', 'true')
            // This query assumes "committed" rows are rendered before staged
            expect(modalQueries.getAllByPlaceholderText(/description of document/i)[0]).toHaveAttribute(
                'aria-invalid',
                'true',
            )
        })

        expect(screen.getByRole('dialog')).toBeInTheDocument()

        const sources = await db.selectFrom('orgDataSource').where('orgId', '=', org.id).execute()
        expect(sources).toEqual([])
    })
})
