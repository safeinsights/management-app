'use client'

import { type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { StudyRequestProvider } from '@/contexts/study-request'

interface StudyLayoutProps {
    children: ReactNode
}

export default function StudyLayout({ children }: StudyLayoutProps) {
    const { orgSlug } = useParams<{ orgSlug: string }>()

    return <StudyRequestProvider submittingOrgSlug={orgSlug}>{children}</StudyRequestProvider>
}
