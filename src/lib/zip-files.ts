import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js'

export type ZippableFile = {
    name: string
    contents: ArrayBuffer
}

/**
 * Bundles decrypted output files into a single zip, in the browser.
 *
 * SECURITY: the inputs are plaintext. The archive is built client-side and handed straight to a
 * blob URL. It must never be uploaded, and the caller should revoke the URL once the download
 * starts so the plaintext isn't reachable from a stale object URL.
 *
 * Names are de-duplicated because the table can legitimately show two artifacts with the same
 * inner path (e.g. the same log re-delivered across job attempts), and a zip with duplicate
 * entries extracts unpredictably.
 */
export async function zipFiles(files: ZippableFile[]): Promise<Blob> {
    const writer = new ZipWriter(new BlobWriter('application/zip'))
    const used = new Map<string, number>()

    for (const file of files) {
        const seen = used.get(file.name) ?? 0
        used.set(file.name, seen + 1)
        await writer.add(
            seen === 0 ? file.name : suffixName(file.name, seen),
            new Uint8ArrayReader(new Uint8Array(file.contents)),
        )
    }

    return await writer.close()
}

function suffixName(name: string, index: number): string {
    const dot = name.lastIndexOf('.')
    if (dot <= 0) return `${name} (${index})`
    return `${name.slice(0, dot)} (${index})${name.slice(dot)}`
}
