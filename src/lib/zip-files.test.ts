import { BlobReader, ZipReader } from '@zip.js/zip.js'
import { describe, expect, it } from '@/tests/unit.helpers'
import { zipFiles } from './zip-files'

const toArrayBuffer = (text: string): ArrayBuffer => {
    const buf = Buffer.from(text, 'utf-8')
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

const entryNames = async (blob: Blob): Promise<string[]> => {
    const reader = new ZipReader(new BlobReader(blob))
    const entries = await reader.getEntries()
    await reader.close()
    return entries.map((entry) => entry.filename)
}

describe('zipFiles', () => {
    it('bundles every file into one archive', async () => {
        const blob = await zipFiles([
            { name: 'run.log', contents: toArrayBuffer('started') },
            { name: 'results.csv', contents: toArrayBuffer('a,b\n1,2') },
        ])

        expect(await entryNames(blob)).toEqual(['run.log', 'results.csv'])
    })

    // Two artifacts can legitimately carry the same inner path (the same log re-delivered across
    // job attempts); duplicate zip entries extract unpredictably, so the later one is renamed.
    it('de-duplicates repeated names instead of writing colliding entries', async () => {
        const blob = await zipFiles([
            { name: 'run.log', contents: toArrayBuffer('first') },
            { name: 'run.log', contents: toArrayBuffer('second') },
            { name: 'notes', contents: toArrayBuffer('third') },
            { name: 'notes', contents: toArrayBuffer('fourth') },
        ])

        expect(await entryNames(blob)).toEqual(['run.log', 'run (1).log', 'notes', 'notes (1)'])
    })

    it('produces an empty archive for no files', async () => {
        expect(await entryNames(await zipFiles([]))).toEqual([])
    })
})
