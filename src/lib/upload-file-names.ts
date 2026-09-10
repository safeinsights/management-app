/**
 * "Keep both" naming for an upload that collides with a file already in the workspace
 * (OTTER-693): `main.R` becomes `main (1).R`, and if that is taken too, `main (2).R`.
 *
 * The suffix goes before the extension so the file stays openable, and already-suffixed names are
 * counted as taken — uploading `main.R` twice must not have the second attempt land back on
 * `main (1).R` and quietly overwrite the first. The original is never renamed; only the arrival is.
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
