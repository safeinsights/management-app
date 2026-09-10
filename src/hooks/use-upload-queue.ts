import { useCallback, useRef, useState } from 'react'
import { nextAvailableFileName, renameFile } from '@/lib/upload-file-names'

export type DuplicateResolution = 'replace' | 'keepBoth' | 'cancel'

interface UseUploadQueueOptions {
    /** Names already in the workspace; a match is what makes an upload a duplicate. */
    existingNames: string[]
    startUpload: (files: File[]) => void
}

/**
 * OTTER-693: an upload whose name already exists has to be asked about before it lands, since
 * replacing is destructive. Files that do not collide go straight up, so a mixed batch is not held
 * hostage by one question, and collisions are asked about one at a time.
 */
export function useUploadQueue({ existingNames, startUpload }: UseUploadQueueOptions) {
    const [duplicates, setDuplicates] = useState<File[]>([])

    /**
     * Names handed out by "Keep both" in this session. The workspace listing only refreshes after
     * an upload settles, so without these, resolving two collisions on the same name in one batch
     * would assign `(1)` twice and the second would overwrite the first.
     */
    const assignedNames = useRef<string[]>([])

    const takenNames = useCallback(() => [...existingNames, ...assignedNames.current], [existingNames])

    const uploadFiles = useCallback(
        (files: File[]) => {
            assignedNames.current = []
            const existing = new Set(existingNames)
            const fresh = files.filter((file) => !existing.has(file.name))
            const colliding = files.filter((file) => existing.has(file.name))

            if (fresh.length > 0) startUpload(fresh)
            if (colliding.length > 0) setDuplicates(colliding)
        },
        [existingNames, startUpload],
    )

    const resolveDuplicate = useCallback(
        (resolution: DuplicateResolution) => {
            setDuplicates(([head, ...rest]) => {
                if (!head) return rest

                if (resolution === 'replace') {
                    // Uploading under the same name overwrites in place, which is what Replace means.
                    startUpload([head])
                } else if (resolution === 'keepBoth') {
                    const name = nextAvailableFileName(head.name, takenNames())
                    assignedNames.current = [...assignedNames.current, name]
                    startUpload([renameFile(head, name)])
                }

                return rest
            })
        },
        [startUpload, takenNames],
    )

    /** The collision currently being asked about, or null when there is nothing to ask. */
    const pendingDuplicate: File | null = duplicates.length > 0 ? duplicates[0] : null

    return { uploadFiles, pendingDuplicate, resolveDuplicate }
}
