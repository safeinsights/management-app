import { describe, expect, it, beforeEach, staleActionError, waitFor, faker, type Mock } from '@/tests/unit.helpers'
import { notifications } from '@mantine/notifications'
import { STALE_DEPLOYMENT_NOTIFICATION_ID } from '@/components/errors'
import { STALE_DEPLOYMENT_TITLE } from '@/lib/errors'
import { getQueryClient } from './providers'

const showMock = notifications.show as unknown as Mock

const failWith = async (error: Error, meta?: { errorMessage: string }) => {
    const queryKey = [faker.string.uuid()]
    await getQueryClient()
        .fetchQuery({ queryKey, queryFn: () => Promise.reject(error), retry: false, meta })
        .catch(() => undefined)
    return queryKey
}

// Queries carry no error handling of their own, so the cache handler is the only thing standing
// between a failed background poll and silence (OTTER-726).
describe('the shared query client', () => {
    beforeEach(() => {
        showMock.mockClear()
    })

    it('offers a reload when a query meets an action id this build no longer holds', async () => {
        await failWith(staleActionError())

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: STALE_DEPLOYMENT_NOTIFICATION_ID, title: STALE_DEPLOYMENT_TITLE }),
            ),
        )
    })

    it('tells the reader about any other failure the query opted in to reporting', async () => {
        await failWith(new TypeError('Failed to fetch'), { errorMessage: 'Failed to load file activity' })

        await waitFor(() =>
            expect(showMock).toHaveBeenCalledWith(
                expect.objectContaining({ color: 'red', title: 'Failed to load file activity' }),
            ),
        )
    })

    it('stays quiet for a query that named no message, rather than toasting every poll', async () => {
        await failWith(new TypeError('Failed to fetch'))

        expect(showMock).not.toHaveBeenCalled()
    })
})
