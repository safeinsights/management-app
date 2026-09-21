'use client'

import { useEffect } from 'react'
import { captureException } from '@sentry/nextjs'
import { useMutation } from '@/common'
import { actionResult } from '@/lib/utils'
import { markOutputsDecisionViewedAction } from '@/server/actions/study-job.actions'

type Options = {
    studyId: string
    isEnabled: boolean
}

// Fires once per mount. A failure is not surfaced: the badge is a courtesy on the lab's own
// dashboard, so a toast would report a problem the reader did not cause and cannot act on.
export function useMarkOutputsDecisionViewed({ studyId, isEnabled }: Options) {
    const { mutate } = useMutation({
        mutationFn: async () => actionResult(await markOutputsDecisionViewedAction({ studyId })),
        onError: (error) => captureException(error),
    })

    useEffect(() => {
        if (isEnabled) mutate()
    }, [isEnabled, mutate])
}
