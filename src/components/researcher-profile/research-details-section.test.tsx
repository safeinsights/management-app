import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { screen, waitFor, fireEvent, act } from '@testing-library/react'
import {
    renderWithProviders,
    userEvent,
    mockSessionWithTestData,
    insertTestResearcherProfile,
    getTestResearcherProfileData,
    db,
} from '@/tests/unit.helpers'
import { ResearchDetailsSection } from './research-details-section'

describe('ResearchDetailsSection', () => {
    describe('research interests pills', () => {
        it('should add interest pill on Enter key', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({ userId: user.id })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const input = screen.getByPlaceholderText('Type a research interest and press enter')
            await userEvents.type(input, 'Machine Learning{Enter}')

            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })
        })

        it('should prevent adding more than 5 interests', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({
                userId: user.id,
                researchDetails: {
                    interests: ['AI', 'ML', 'Data Science', 'NLP', 'Computer Vision'],
                    detailedPublicationsUrl: 'https://scholar.google.com/user',
                },
            })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            await waitFor(() => {
                const pillsInput = document.getElementById('researchInterests') as HTMLInputElement
                expect(pillsInput).toBeTruthy()
                expect(pillsInput.disabled).toBe(false)
                expect(pillsInput.placeholder).toBe('')
            })

            expect(screen.queryByText(/include up to five/i)).toBeNull()

            const input = document.getElementById('researchInterests') as HTMLInputElement
            await userEvents.type(input, 'Robotics{Enter}')

            await waitFor(() => {
                expect(screen.queryByText('Robotics')).toBeNull()
            })
        })

        it('should block typing in input when at 5-pill limit', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({
                userId: user.id,
                researchDetails: {
                    interests: ['AI', 'ML', 'Data Science', 'NLP', 'Computer Vision'],
                    detailedPublicationsUrl: 'https://scholar.google.com/user',
                },
            })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            const input = await waitFor(() => {
                const el = document.getElementById('researchInterests') as HTMLInputElement
                expect(el).toBeTruthy()
                return el
            })

            await userEvents.type(input, 'Robotics')

            expect(input.value).toBe('')
        })

        it('should allow backspace removal when at 5-pill limit', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({
                userId: user.id,
                researchDetails: {
                    interests: ['AI', 'ML', 'Data Science', 'NLP', 'Computer Vision'],
                    detailedPublicationsUrl: 'https://scholar.google.com/user',
                },
            })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            await waitFor(() => {
                expect(screen.getByText('Computer Vision')).toBeDefined()
            })

            const input = document.getElementById('researchInterests') as HTMLInputElement
            await userEvents.click(input)
            await userEvents.keyboard('{Backspace}')

            await waitFor(() => {
                expect(screen.queryByText('Computer Vision')).toBeNull()
            })

            expect(screen.getByText('AI')).toBeDefined()
            expect(screen.getByText('NLP')).toBeDefined()
        })

        it('should remove interest pill when clicking remove button', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({
                userId: user.id,
                researchDetails: {
                    interests: ['Machine Learning', 'Data Science'],
                    detailedPublicationsUrl: 'https://scholar.google.com/user',
                },
            })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })

            // Mantine marks pill remove buttons as aria-hidden.
            const firstPill = screen.getByText('Machine Learning').closest('.mantine-Pill-root')
            const removeButton = firstPill?.querySelector('.mantine-Pill-remove') as HTMLElement
            await userEvents.click(removeButton)

            await waitFor(() => {
                expect(screen.queryByText('Machine Learning')).toBeNull()
            })
            expect(screen.getByText('Data Science')).toBeDefined()
        })

        it('should remove last interest pill on Backspace when input is empty', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({
                userId: user.id,
                researchDetails: {
                    interests: ['Machine Learning', 'Data Science'],
                    detailedPublicationsUrl: 'https://scholar.google.com/user',
                },
            })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const editButton = screen.getByRole('button', { name: /edit/i })
            await userEvents.click(editButton)

            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
                expect(screen.getByText('Data Science')).toBeDefined()
            })

            const input = screen.getByPlaceholderText('Type a research interest and press enter')
            await userEvents.click(input)
            await userEvents.keyboard('{Backspace}')

            await waitFor(() => {
                expect(screen.queryByText('Data Science')).toBeNull()
            })
            expect(screen.getByText('Machine Learning')).toBeDefined()
        })

        it('should prevent duplicate interests (case-insensitive)', async () => {
            const userEvents = userEvent.setup()
            const { user } = await mockSessionWithTestData({ orgType: 'lab' })

            await insertTestResearcherProfile({ userId: user.id })

            const data = await getTestResearcherProfileData(user.id)
            const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

            renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

            const input = screen.getByPlaceholderText('Type a research interest and press enter')

            await userEvents.type(input, 'Machine Learning{Enter}')
            await waitFor(() => {
                expect(screen.getByText('Machine Learning')).toBeDefined()
            })

            await userEvents.type(input, 'machine learning{Enter}')

            // The aria-live status region mirrors the interest text and would double the count.
            await waitFor(() => {
                const pills = screen.getAllByText(/machine learning/i).filter((el) => !el.closest('[role="status"]'))
                expect(pills.length).toBe(1)
            })
        })
    })

    it('should save research details', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'AI Research{Enter}')

        const urlInput = screen.getByPlaceholderText('https://scholar.google.com/user...')
        await userEvents.type(urlInput, 'https://scholar.google.com/citations?user=abc123')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        const updated = await db
            .selectFrom('researcherProfile')
            .select(['researchInterests', 'detailedPublicationsUrl'])
            .where('userId', '=', user.id)
            .executeTakeFirstOrThrow()

        expect(updated.researchInterests).toEqual(['AI Research'])
        expect(updated.detailedPublicationsUrl).toBe('https://scholar.google.com/citations?user=abc123')
    })

    it('should save a research interest that was typed without pressing Enter', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        // Type the interest last and never press Enter, so the draft is uncommitted at submit.
        const urlInput = screen.getByPlaceholderText('https://scholar.google.com/user...')
        await userEvents.type(urlInput, 'https://scholar.google.com/citations?user=abc123')

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'Quantum Computing')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(refetch).toHaveBeenCalled()
        })

        const updated = await db
            .selectFrom('researcherProfile')
            .select(['researchInterests', 'detailedPublicationsUrl'])
            .where('userId', '=', user.id)
            .executeTakeFirstOrThrow()

        expect(updated.researchInterests).toEqual(['Quantum Computing'])
        expect(updated.detailedPublicationsUrl).toBe('https://scholar.google.com/citations?user=abc123')
    })

    // The uncommitted draft is separate state that form.isDirty() cannot see, so a resync
    // would silently drop it on Save.
    it('does not pull refetched interests into an open edit form with an uncommitted draft', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            researchDetails: {
                interests: ['AI', 'ML', 'Data Science', 'NLP'],
                detailedPublicationsUrl: 'https://scholar.google.com/user',
            },
        })

        const initialData = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        // Mutate harness state directly rather than clicking, so the input never blurs.
        let deliverRefetch: () => void = () => {}
        const Harness = () => {
            const [data, setData] = useState(initialData)
            deliverRefetch = () =>
                setData((prev) =>
                    prev
                        ? {
                              ...prev,
                              profile: {
                                  ...prev.profile,
                                  researchInterests: ['AI', 'ML', 'Data Science', 'NLP', 'ServerAddedInterest'],
                              },
                          }
                        : prev,
                )
            return <ResearchDetailsSection data={data} refetch={refetch} />
        }

        renderWithProviders(<Harness />)

        const editButton = screen.getByRole('button', { name: /edit/i })
        await userEvents.click(editButton)

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'MyDraftInterest')

        await act(async () => {
            deliverRefetch()
        })

        expect(screen.queryByText('ServerAddedInterest')).toBeNull()
        expect((interestInput as HTMLInputElement).value).toBe('MyDraftInterest')
    })

    // Mantine's dirty tracking misses this combination of list and scalar edits, so the guard
    // cannot rely on it.
    it('preserves a committed interest edit when a background refetch changes server data', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({
            userId: user.id,
            researchDetails: {
                interests: ['AI', 'ML'],
                detailedPublicationsUrl: 'https://scholar.google.com/user',
            },
        })

        const initialData = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        let deliverRefetch: () => void = () => {}
        const Harness = () => {
            const [data, setData] = useState(initialData)
            deliverRefetch = () =>
                setData((prev) =>
                    prev
                        ? {
                              ...prev,
                              profile: {
                                  ...prev.profile,
                                  researchInterests: ['AI', 'ML', 'ServerAddedInterest'],
                              },
                          }
                        : prev,
                )
            return <ResearchDetailsSection data={data} refetch={refetch} />
        }

        renderWithProviders(<Harness />)

        await userEvents.click(screen.getByRole('button', { name: /edit/i }))

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'KeepMe{Enter}')
        await waitFor(() => expect(screen.getByText('KeepMe')).toBeDefined())

        const urlInput = screen.getByPlaceholderText('https://scholar.google.com/user...')
        await userEvents.type(urlInput, 'X')
        await userEvents.clear(urlInput)
        await userEvents.type(urlInput, 'https://scholar.google.com/user')

        await act(async () => {
            deliverRefetch()
        })

        expect(screen.getByText('KeepMe')).toBeDefined()
        expect(screen.queryByText('ServerAddedInterest')).toBeNull()
    })

    it('should commit a typed interest to a pill when the field loses focus', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'Bioinformatics')

        await userEvents.tab()

        await waitFor(() => {
            expect(screen.getByText('Bioinformatics')).toBeDefined()
        })
    })

    it('should surface a validation message for an invalid URL instead of silently disabling save', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'AI Research{Enter}')

        const urlInput = screen.getByPlaceholderText('https://scholar.google.com/user...')
        await userEvents.type(urlInput, 'not-a-valid-url')

        const saveButton = screen.getByRole('button', { name: /save changes/i })
        await userEvents.click(saveButton)

        await waitFor(() => {
            expect(screen.getByText(/must start with http:\/\/ or https:\/\//i)).toBeDefined()
        })
        expect(refetch).not.toHaveBeenCalled()
    })

    // A tab/window switch reaches the field as a bare focusout, indistinguishable from the
    // widget dropping focus to <body> mid-interaction, so neither commits (OTTER-624).
    it('should not commit a typed interest when the document loses focus', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'Ephemeral Idea')

        fireEvent.blur(interestInput, { relatedTarget: null })

        expect(screen.queryByText('Ephemeral Idea')).toBeNull()
        expect((interestInput as HTMLInputElement).value).toBe('Ephemeral Idea')
    })

    // An outside press is the only signal separating this from the tab-switch case, so it is
    // driven by a real click rather than a synthetic blur (OTTER-647).
    it('commits the draft when the user clicks a non-focusable part of the page', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'Committed Idea')

        await userEvents.click(screen.getByText(/Provide a digital link/i))

        expect(await screen.findByText('Committed Idea')).toBeInTheDocument()
        expect((interestInput as HTMLInputElement).value).toBe('')
    })

    it('should not commit a typed interest when focus moves to a control inside the widget', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'Uncommitted Draft')

        // relatedTarget lands inside the PillsInput widget, where a pill's remove button lives.
        const inWidgetControl = interestInput.parentElement as HTMLElement
        fireEvent.blur(interestInput, { relatedTarget: inWidgetControl })

        expect(screen.queryByText('Uncommitted Draft')).toBeNull()
        expect((interestInput as HTMLInputElement).value).toBe('Uncommitted Draft')
    })

    it('should announce added research interests in an aria-live region', async () => {
        const userEvents = userEvent.setup()
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })

        await insertTestResearcherProfile({ userId: user.id })

        const data = await getTestResearcherProfileData(user.id)
        const refetch = vi.fn(async () => getTestResearcherProfileData(user.id))

        renderWithProviders(<ResearchDetailsSection data={data} refetch={refetch} />)

        const interestInput = screen.getByPlaceholderText('Type a research interest and press enter')
        await userEvents.type(interestInput, 'Genomics{Enter}')

        await waitFor(() => {
            const regions = screen.getAllByRole('status')
            expect(regions.some((region) => region.textContent?.includes('Genomics'))).toBe(true)
        })
    })
})
