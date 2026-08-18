'use client'

import { RequireStudyAgreement } from '@/components/legal/require-study-agreement'
import { useParams } from 'next/navigation'
import { type ReactNode } from 'react'

/**
 * Mount point for the Study Agreement gate.
 *
 * At the segment boundary rather than on the pages the design names, so no route of a blocked study
 * is reachable — the proposal step, the code upload and the review pages are all behind it.
 */
export default function StudyIdLayout({ children }: { children: ReactNode }) {
    const { studyId } = useParams<{ studyId: string }>()

    return (
        <>
            <RequireStudyAgreement studyId={studyId} />
            {children}
        </>
    )
}
