'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@/hooks/query-wrappers'
import { markStudyAsViewedAction } from '@/server/actions/study.actions'

type StudyViewTrackerProps = {
    studyId: string
}

export function StudyViewTracker({ studyId }: StudyViewTrackerProps) {
    const queryClient = useQueryClient()

    useEffect(() => {
        markStudyAsViewedAction({ studyId }).then((result) => {
            if (typeof result !== 'object' || result === null || !('wasUpdated' in result) || !result.wasUpdated) return
            queryClient.invalidateQueries({ queryKey: ['orgs-with-stats'] })
            queryClient.invalidateQueries({ queryKey: ['org-studies'] })
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-reviewer-studies'] })
        })
    }, [studyId, queryClient])

    return null
}
