'use client'

import { useState } from 'react'
import type { JobFileInfo } from '@/lib/types'

// A local phase flip rather than a route change: decrypting changes no server state, and the
// plaintext stays in memory.
export function useDecryptPhase() {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[] | null>(null)

    return { decryptedFiles, isLocked: decryptedFiles === null, onDecrypted: setDecryptedFiles }
}
