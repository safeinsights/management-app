import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redirect, useParams } from 'next/navigation'
import { StudyRequestProvider } from '@/contexts/study-request'
import { Routes } from '@/lib/routes'
import {
    faker,
    insertTestOrg,
    mockDualRoleSessionWithTestData,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import RequestStudyPage from './page'

const mockRedirect = vi.mocked(redirect)

beforeEach(() => {
    mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT')
    })
})

const renderRoute = (orgSlug: string) => RequestStudyPage({ params: Promise.resolve({ orgSlug }) })

// StudyProposal reads useStudyRequest(); production wires that provider in the study layout.
const renderPage = async (orgSlug: string) => {
    ;(useParams as Mock).mockReturnValue({ orgSlug })
    const page = await renderRoute(orgSlug)
    renderWithProviders(<StudyRequestProvider submittingOrgSlug={orgSlug}>{page}</StudyRequestProvider>)
}

describe('RequestStudyPage', () => {
    it('renders Step 1 for a lab member', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })

        await renderPage(org.slug)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Save & continue' })).toBeInTheDocument()
    })

    // OTTER-768: a Data Partner cannot submit a study, so its slug has no study wizard.
    it('sends a Data Partner member to their org dashboard', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'enclave' })

        await expect(renderRoute(org.slug)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(Routes.orgDashboard({ orgSlug: org.slug }))
    })

    it('sends a dual-role user on the Data Partner slug to that dashboard', async () => {
        const { enclaveOrg } = await mockDualRoleSessionWithTestData()

        await expect(renderRoute(enclaveOrg.slug)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(Routes.orgDashboard({ orgSlug: enclaveOrg.slug }))
    })

    it('renders Step 1 for a dual-role user on the lab slug', async () => {
        const { labOrg } = await mockDualRoleSessionWithTestData()

        await renderPage(labOrg.slug)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Save & continue' })).toBeInTheDocument()
    })

    it('renders Step 1 for an SI admin on a lab they do not belong to', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })

        await renderPage(lab.slug)

        expect(mockRedirect).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Save & continue' })).toBeInTheDocument()
    })

    it('sends an SI admin on a Data Partner slug to that dashboard', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })

        await expect(renderRoute(enclave.slug)).rejects.toThrow('NEXT_REDIRECT')
        expect(mockRedirect).toHaveBeenCalledWith(Routes.orgDashboard({ orgSlug: enclave.slug }))
    })
})
