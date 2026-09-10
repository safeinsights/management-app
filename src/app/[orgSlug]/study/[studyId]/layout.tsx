'use client'

import { RequireStudyAgreement } from '@/components/legal/require-study-agreement'
import { useParams } from 'next/navigation'
import { type ReactNode } from 'react'

// At the segment boundary rather than on the two pages the design names, so no route of a blocked
// study is reachable.
export default function StudyIdLayout({ children }: { children: ReactNode }) {
    const { studyId } = useParams<{ studyId: string }>()

    return (
        <>
            <RequireStudyAgreement studyId={studyId} />
            {children}
        </>
    )
}
