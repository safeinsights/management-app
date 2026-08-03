/**
 * Triggers a browser download for in-memory bytes.
 *
 * A programmatic download rather than a `<a download>` element because the click has to do two
 * things at once — record the internal "downloaded" event and hand over the file — and an anchor
 * only does the second.
 *
 * The object URL is revoked on the next tick: revoking synchronously races the browser's own
 * fetch of the blob, and holding it forever leaves plaintext output reachable from a stale URL.
 */
export function downloadBlob(fileName: string, blob: Blob): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
}
