'use client'

import { useState } from 'react'
import type { JobFileInfo } from '@/lib/types'

/**
 * The browser-side decryption flip, shared by every outputs surface (OTTER-696 review).
 *
 * Decrypting changes no server state, so advancing past the key form is a local phase flip rather
 * than a route change, and the plaintext must stay in memory and never travel back to the server.
 * Three surfaces need exactly these three values — the reviewer's review panel, the researcher's
 * errored-outputs panel and the post-decision re-decrypt — so the flip lives here once instead of
 * being re-declared per panel.
 */
export function useDecryptPhase() {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[] | null>(null)

    return { decryptedFiles, isLocked: decryptedFiles === null, onDecrypted: setDecryptedFiles }
}
