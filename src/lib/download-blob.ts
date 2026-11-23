export function downloadURL(fileName: string, url: string): void {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
}

// The object URL is revoked on the next tick: revoking synchronously races the browser's fetch.
export function downloadBlob(fileName: string, blob: Blob): void {
    const url = URL.createObjectURL(blob)
    downloadURL(fileName, url)
    setTimeout(() => URL.revokeObjectURL(url), 0)
}
