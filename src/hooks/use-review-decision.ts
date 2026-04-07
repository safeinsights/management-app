import { useState } from 'react'
import type { Decision } from '@/app/[orgSlug]/study/[studyId]/review/review-types'

export function useReviewDecision() {
    const [selected, setSelected] = useState<Decision | null>(null)

    return {
        selected,
        onSelect: setSelected,
    }
}
