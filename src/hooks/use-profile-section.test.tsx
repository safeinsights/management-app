import { notifications } from '@mantine/notifications'
import {
    act,
    createTestQueryWrapper,
    db,
    describe,
    expect,
    getTestResearcherProfileData,
    insertTestResearcherProfile,
    it,
    mockSessionWithTestData,
    renderHook,
    vi,
    waitFor,
} from '@/tests/unit.helpers'
import { useProfileSection } from '@/hooks/use-profile-section'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'
import { updateEducationAction } from '@/server/actions/researcher-profile.actions'
import { educationSchema, type EducationValues } from '@/schema/researcher-profile'

const toDefaults = (data: ResearcherProfileData | null): EducationValues => ({
    educationalInstitution: data?.profile.educationInstitution ?? '',
    degree: data?.profile.educationDegree ?? '',
    fieldOfStudy: data?.profile.educationFieldOfStudy ?? '',
    isCurrentlyPursuing: Boolean(data?.profile.educationIsCurrentlyPursuing),
})

const renderSection = (initialData: ResearcherProfileData | null, options: { skipUnchanged?: boolean } = {}) => {
    const refetch = vi.fn(async () => undefined)
    const hook = renderHook(
        ({ data }) =>
            useProfileSection(data, refetch, {
                schema: educationSchema,
                toDefaults,
                initialEditing: (v) => (v.educationalInstitution ? null : true),
                save: updateEducationAction,
                successMessage: 'Education updated',
                ...options,
            }),
        { initialProps: { data: initialData }, wrapper: createTestQueryWrapper() },
    )
    return { ...hook, refetch }
}

const withInstitution = (data: ResearcherProfileData, educationInstitution: string): ResearcherProfileData => ({
    ...data,
    profile: { ...data.profile, educationInstitution },
})

const profileWithEducation = async () => {
    const { user } = await mockSessionWithTestData({ orgType: 'lab' })
    await insertTestResearcherProfile({
        userId: user.id,
        education: { institution: 'MIT', degree: 'Ph.D.', fieldOfStudy: 'Computer Science' },
    })
    return { user, data: await getTestResearcherProfileData(user.id) }
}

describe('useProfileSection', () => {
    it('opens for editing, seeded from server data, when the section is incomplete', async () => {
        const { user } = await mockSessionWithTestData({ orgType: 'lab' })
        await insertTestResearcherProfile({ userId: user.id, education: { institution: '', degree: 'Ph.D.' } })
        const data = await getTestResearcherProfileData(user.id)

        const { result, rerender } = renderSection(null)
        rerender({ data })

        await waitFor(() => expect(result.current.form.values.degree).toBe('Ph.D.'))
        expect(result.current.isEditing).toBe(true)
    })

    it('stays closed when the section is complete', async () => {
        const { data } = await profileWithEducation()

        const { result } = renderSection(data)

        expect(result.current.isEditing).toBe(false)
        expect(result.current.form.values.educationalInstitution).toBe('MIT')
    })

    it('waits for data before deciding whether to open', async () => {
        const { data } = await profileWithEducation()

        const { result, rerender } = renderSection(null)
        expect(result.current.isEditing).toBe(false)

        rerender({ data })

        await waitFor(() => expect(result.current.form.values.educationalInstitution).toBe('MIT'))
        expect(result.current.isEditing).toBe(false)
    })

    it('reseeds the form from refetched data while closed', async () => {
        const { data } = await profileWithEducation()
        const { result, rerender } = renderSection(data)

        rerender({ data: withInstitution(data, 'Rice') })

        await waitFor(() => expect(result.current.form.values.educationalInstitution).toBe('Rice'))
    })

    it('keeps unsaved input when data is refetched while editing', async () => {
        const { data } = await profileWithEducation()
        const { result, rerender } = renderSection(data)

        act(() => {
            result.current.setEditing(true)
        })
        act(() => {
            result.current.form.setFieldValue('educationalInstitution', 'Unsaved School')
        })
        rerender({ data: withInstitution(data, 'Rice') })

        expect(result.current.form.values.educationalInstitution).toBe('Unsaved School')
        expect(result.current.isEditing).toBe(true)
    })

    it('saves, refetches, closes and confirms', async () => {
        const { user, data } = await profileWithEducation()
        const { result, refetch } = renderSection(data)

        act(() => {
            result.current.setEditing(true)
        })
        act(() => {
            result.current.submit({ ...result.current.form.values, educationalInstitution: 'Stanford' })
        })

        await waitFor(() => expect(result.current.isEditing).toBe(false))
        expect(refetch).toHaveBeenCalled()
        expect(notifications.show).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Saved', message: 'Education updated' }),
        )
        const saved = await db
            .selectFrom('researcherProfile')
            .select('educationInstitution')
            .where('userId', '=', user.id)
            .executeTakeFirstOrThrow()
        expect(saved.educationInstitution).toBe('Stanford')
    })

    it('closes without saving when skipUnchanged is set and nothing changed', async () => {
        const { data } = await profileWithEducation()
        const { result, refetch } = renderSection(data, { skipUnchanged: true })

        act(() => {
            result.current.setEditing(true)
        })
        act(() => {
            result.current.submit(result.current.form.values)
        })

        expect(result.current.isEditing).toBe(false)
        expect(result.current.isPending).toBe(false)
        expect(refetch).not.toHaveBeenCalled()
    })
})
