'use client'

import { FeedbackAndNotesSection } from '@/components/study/feedback-and-notes'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'

/**
 * Renders the prior-round reviewer feedback and resubmission notes as a
 * read-only history block above the editable round-N editor.
 *
 * Returns null when there is no history (cold round 1 with no comments yet),
 * which keeps the round-1 layout unchanged.
 */
export function PriorFeedbackHistory({ entries }: { entries: ProposalFeedbackEntry[] }) {
    if (entries.length === 0) return null
    return <FeedbackAndNotesSection entries={entries} />
}
