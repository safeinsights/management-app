/**
 * "Keep both" naming for a colliding upload (OTTER-693): `main.R` becomes `main (1).R`. The suffix
 * goes before the extension so the file stays openable.
 */
export function nextAvailableFileName(fileName: string, existingNames: Iterable<string>): string {
    const taken = new Set(existingNames)
    if (!taken.has(fileName)) return fileName

    const dot = fileName.lastIndexOf('.')
    // A leading dot is the whole name of a dotfile, not an extension, so it keeps its suffix last.
    const hasExtension = dot > 0
    const base = hasExtension ? fileName.slice(0, dot) : fileName
    const extension = hasExtension ? fileName.slice(dot) : ''

    for (let n = 1; ; n++) {
        const candidate = `${base} (${n})${extension}`
        if (!taken.has(candidate)) return candidate
    }
}

/** A copy of `file` under a new name; File.name is read-only, so the bytes are rewrapped. */
export function renameFile(file: File, name: string): File {
    return new File([file], name, { type: file.type, lastModified: file.lastModified })
}
