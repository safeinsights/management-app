'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { type ResubmitCodeContextValue, type ResubmitStudyData } from './resubmit-code-types'

const ResubmitCodeContext = createContext<ResubmitCodeContextValue | null>(null)

export function useResubmitCode(): ResubmitCodeContextValue {
    const context = useContext(ResubmitCodeContext)
    if (!context) {
        throw new Error('useResubmitCode must be used within ResubmitCodeProvider')
    }
    return context
}

interface ResubmitCodeProviderProps {
    children: ReactNode
    study: ResubmitStudyData
}

export function ResubmitCodeProvider({ children, study }: ResubmitCodeProviderProps) {
    const { id: studyId, title: studyTitle, orgSlug, submittedByOrgSlug: submittingOrgSlug, language } = study

    const value: ResubmitCodeContextValue = useMemo(
        () => ({ studyId, studyTitle, orgSlug, submittingOrgSlug, language }),
        [studyId, studyTitle, orgSlug, submittingOrgSlug, language],
    )

    return <ResubmitCodeContext.Provider value={value}>{children}</ResubmitCodeContext.Provider>
}
