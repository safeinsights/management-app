import { useState } from 'react'
import type { CodeDecision } from '@/lib/code-review'

export function useCodeReviewDecision() {
    const [selected, setSelected] = useState<CodeDecision | null>(null)

    return {
        selected,
        onSelect: setSelected,
    }
}
