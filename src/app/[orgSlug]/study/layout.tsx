'use client'

import { type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { StudyRequestProvider } from '@/contexts/study-request'

interface StudyLayoutProps {
    children: ReactNode
}

/**
 * Layout for all study-related routes.
 * Provides the StudyRequestContext for the study request flow.
 */
export default function StudyLayout({ children }: StudyLayoutProps) {
    const { orgSlug } = useParams<{ orgSlug: string }>()

    return <StudyRequestProvider submittingOrgSlug={orgSlug}>{children}</StudyRequestProvider>
}
