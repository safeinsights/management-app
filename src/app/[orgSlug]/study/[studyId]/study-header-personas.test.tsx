import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { useParams } from 'next/navigation'
import { memoryRouter } from 'next-router-mock'
import {
    insertTestStudyOnly,
    mockDualRoleSessionWithTestData,
    pageHeaderEyebrow,
    renameTestOrg,
    renderWithProviders,
    screen,
    type Mock,
} from '@/tests/unit.helpers'
import { displayOrgName } from '@/lib/string'
import StudyViewPage from './view/page'
import StudyReviewPage from './review/page'

const LAB_NAME = 'Genius Lab'
const DATA_PARTNER_NAME = 'Mars University'
const STUDY_TITLE = 'Impact of highlighting on student learning outcomes'

/**
 * The eyebrow names the lab that submitted the study, never the org whose page is being read, so
 * the Research Lab and the Data Partner see the same header (OTTER-619). Both personas go through
 * their real routes: a component test cannot tell the two apart.
 */
describe('study page header across personas', () => {
    it('names the submitting research lab for the researcher and for the reviewer', async () => {
        memoryRouter.setCurrentUrl('/')
        const { user, labOrg, enclaveOrg } = await mockDualRoleSessionWithTestData()
        await renameTestOrg(labOrg.id, LAB_NAME)
        await renameTestOrg(enclaveOrg.id, DATA_PARTNER_NAME)

        const { study } = await insertTestStudyOnly({
            org: enclaveOrg,
            submittedByOrg: labOrg,
            researcherId: user.id,
            title: STUDY_TITLE,
            status: 'PENDING-REVIEW',
        })

        ;(useParams as Mock).mockReturnValue({ orgSlug: labOrg.slug, studyId: study.id })
        const researcherPage = await StudyViewPage({
            params: Promise.resolve({ orgSlug: labOrg.slug, studyId: study.id }),
            searchParams: Promise.resolve({}),
        })
        const researcherView = renderWithProviders(researcherPage)

        expect(screen.getByRole('heading', { level: 1, name: STUDY_TITLE })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe(displayOrgName(LAB_NAME))
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
        researcherView.unmount()
        ;(useParams as Mock).mockReturnValue({ orgSlug: enclaveOrg.slug, studyId: study.id })
        // The reviewer page can also return a guard alert, so its node is narrowed to an element.
        const reviewerPage = (await StudyReviewPage({
            params: Promise.resolve({ orgSlug: enclaveOrg.slug, studyId: study.id }),
        })) as ReactElement
        renderWithProviders(reviewerPage)

        expect(screen.getByRole('heading', { level: 1, name: STUDY_TITLE })).toBeInTheDocument()
        expect(pageHeaderEyebrow()).toBe(displayOrgName(LAB_NAME))
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    })
})
