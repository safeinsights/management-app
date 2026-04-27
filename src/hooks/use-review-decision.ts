import { useState } from 'react'
import type { Decision } from '@/lib/proposal-review'

export function useReviewDecision() {
    const [selected, setSelected] = useState<Decision | null>(null)

    return {
        selected,
        onSelect: setSelected,
    }
}
