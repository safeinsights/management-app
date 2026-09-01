import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js'

export type ZippableFile = {
    name: string
    contents: ArrayBuffer
}

// SECURITY: the inputs are plaintext, so the archive must never be uploaded and the caller must
// revoke the blob URL once the download starts.
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
