'use client'

import { FC } from 'react'
import { PoliteStatus } from '@/components/polite-status'
import { CodeRunHistory, usePriorRunOutputs } from '@/components/study/code-run-history'
import type { PriorCodeRun } from '@/server/db/queries'

type ResearcherCodeRunHistoryProps = {
    runs: PriorCodeRun[]
    withHistoryKey: boolean
}

// The feedback-only screen has no latest key to feed earlier runs, so the history owns their
// outputs here and opens them with its own key.
export const ResearcherCodeRunHistory: FC<ResearcherCodeRunHistoryProps> = ({ runs, withHistoryKey }) => {
    const priorOutputs = usePriorRunOutputs(runs, 'researcher')
    return (
        <>
            <CodeRunHistory
                role="researcher"
                runs={runs}
                outputs={priorOutputs}
                isLatestDecrypted={false}
                withHistoryKey={withHistoryKey}
            />
            <PoliteStatus announcement={priorOutputs.announcement} />
        </>
    )
}
