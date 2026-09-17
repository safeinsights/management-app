import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@/common'
import { reportMutationError } from '@/components/errors'
import { getMainCodeFileAction, setMainCodeFileAction } from '@/server/actions/workspace-files.actions'

interface UseMainFileOptions {
    studyId: string
    /** Names currently in the workspace; a choice only holds while its file is still there. */
    fileNames: string[]
    /** The previous submission's main file, inherited when nothing else applies. */
    previousMainFile: string | null
    /** Called once the choice is persisted, so the page's save indicator can report it. */
    onSaved: () => void
}

/**
 * OTTER-693: which file runs first in the enclave. The star saves on click rather than at submit, so
 * this owns the optimistic move and the rollback a rejected save needs.
 */
export function useMainFile({ studyId, fileNames, previousMainFile, onSaved }: UseMainFileOptions) {
    const [override, setOverride] = useState<string | null>(null)

    const { data: savedMainFile } = useQuery({
        queryKey: ['main-code-file', studyId],
        queryFn: () => getMainCodeFileAction({ studyId }),
    })

    const persistedMainFile = savedMainFile?.mainCodeFileName ?? null

    const mainFile = useMemo(() => {
        // This session's click first, then the saved choice, and only then the conveniences: a
        // deliberate selection must outrank auto-picking the sole file.
        if (override && fileNames.includes(override)) return override
        if (persistedMainFile && fileNames.includes(persistedMainFile)) return persistedMainFile
        if (fileNames.length === 1) return fileNames[0]
        if (previousMainFile && fileNames.includes(previousMainFile)) return previousMainFile
        return ''
    }, [override, persistedMainFile, previousMainFile, fileNames])

    // Where the star sat before the current optimistic move, so a rejected save can put it back.
    const previousOverrideRef = useRef<string | null>(null)

    const saveMainFile = useMutation({
        mutationFn: (fileName: string) => setMainCodeFileAction({ studyId, fileName }),
        onSuccess: onSaved,
        onError: (error) => {
            setOverride(previousOverrideRef.current)
            reportMutationError('Failed to save your main file selection')(error)
        },
    })

    const selectMainFile = useCallback(
        (fileName: string) => {
            // Optimistic: the star moves on click and the save follows, so the radio never lags a
            // round trip behind the pointer.
            previousOverrideRef.current = override
            setOverride(fileName)
            saveMainFile.mutate(fileName)
        },
        [override, saveMainFile],
    )

    /**
     * Drops a deleted file's claim. `mainFile` already ignores an override that is not in
     * `fileNames`, but without this a later re-upload of the same name would resurrect a star the
     * researcher had removed.
     */
    const forgetFile = useCallback((fileName: string) => {
        setOverride((prev) => (prev === fileName ? null : prev))
    }, [])

    return { mainFile, selectMainFile, forgetFile, isSaving: saveMainFile.isPending }
}
