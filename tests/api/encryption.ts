import path from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'

export type PublicKeyRef = { fingerprint: string; publicKey: ArrayBuffer }

export type ResultsWriterLike = {
    addFile(fileName: string, content: ArrayBuffer): Promise<void>
    generate(): Promise<Blob>
}

type EncryptionModule = {
    ResultsWriter: new (keys: PublicKeyRef[], opts: { jobId: string }) => ResultsWriterLike
    pemToArrayBuffer(pem: string): ArrayBuffer
    fingerprintKeyData(key: ArrayBuffer): Promise<string>
}

let loaded: Promise<EncryptionModule> | undefined

// si-encryption ships TypeScript sources only and Node refuses to strip types under node_modules, so
// the writer the enclave uses is bundled on first use and imported from a data URL. No child process
// (this replaces the execSync of bin/debug/upload-results.ts) and nothing written to disk.
export function loadEncryption(): Promise<EncryptionModule> {
    loaded ??= (async () => {
        const here = path.dirname(fileURLToPath(import.meta.url))
        const requireAnchor = path.join(here, 'si-encryption-bundle.js')
        const result = await build({
            stdin: {
                contents:
                    "export { ResultsWriter } from 'si-encryption/job-results/writer'\n" +
                    "export { pemToArrayBuffer, fingerprintKeyData } from 'si-encryption/util/keypair'\n",
                resolveDir: here,
                loader: 'ts',
            },
            bundle: true,
            write: false,
            format: 'esm',
            platform: 'node',
            target: 'node22',
            logLevel: 'silent',
            // si-encryption's logger (`debug`) is CommonJS and requires `tty` at load; an ESM bundle
            // only has a `require` if one is put in scope, and a data URL has no file to derive it from.
            banner: {
                js: `import { createRequire as __createRequire } from 'module'; const require = __createRequire(${JSON.stringify(requireAnchor)});`,
            },
        })
        const code = Buffer.from(result.outputFiles[0].text).toString('base64')
        return (await import(`data:text/javascript;base64,${code}`)) as EncryptionModule
    })()
    return loaded
}
