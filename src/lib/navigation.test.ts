import { BLANK_UUID, describe, expect, it, vi } from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import { pushDecided } from './navigation'

const params = { orgSlug: 'openstax', studyId: BLANK_UUID }
const REVIEW = Routes.studyReview(params)
const CODE = Routes.studyReviewCode(params)

const router = () => ({
    push: vi.fn(),
    refresh: vi.fn(),
})

describe('pushDecided', () => {
    it('refreshes when the destination is the URL the tab is already on', () => {
        const navigation = router()

        pushDecided(navigation, REVIEW, REVIEW)

        expect(navigation.push).toHaveBeenCalledWith(REVIEW)
        expect(navigation.refresh).toHaveBeenCalledTimes(1)
    })

    it('leaves the push to do the work when the destination is a different URL', () => {
        const navigation = router()

        pushDecided(navigation, REVIEW, CODE)

        expect(navigation.push).toHaveBeenCalledWith(CODE)
        expect(navigation.refresh).not.toHaveBeenCalled()
    })
})
