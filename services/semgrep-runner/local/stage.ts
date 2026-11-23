// Run inside the runner image by run-local: stages a ruleset version the way the store writes it.
// Copies the rule files of /in/rules to /out/rules, the fixtures of /in/tests (gate mode) to
// /out/tests, and writes /out/version.json, the manifest the runner checks the files against.
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { RulesetManifest } from '../protocol.ts'

const PROTOCOL_IN_IMAGE = '/var/task/services/semgrep-runner/protocol.ts'
const { isRuleFile, rulesetManifestSchema } = (await import(PROTOCOL_IN_IMAGE)) as {
    isRuleFile: (file: string) => boolean
    rulesetManifestSchema: { parse: (value: unknown) => RulesetManifest }
}

const [version, withTests] = process.argv.slice(2)
const OUT = '/out'

function listFiles(root: string): string[] {
    if (!fs.existsSync(root)) return []
    return fs
        .readdirSync(root, { recursive: true, encoding: 'utf-8' })
        .filter((relative) => fs.statSync(path.join(root, relative)).isFile())
        .map((relative) => relative.split(path.sep).join('/'))
        .sort()
}

function copyInto(root: string, files: string[], dest: string) {
    for (const file of files) {
        const target = path.join(OUT, dest, file)
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.copyFileSync(path.join(root, file), target)
    }
    return files.map((file) => `${dest}/${file}`)
}

const ruleFiles = listFiles('/in/rules').filter((file) => isRuleFile(file))
const testFiles = withTests === 'tests' ? listFiles('/in/tests') : []
const files = [...copyInto('/in/rules', ruleFiles, 'rules'), ...copyInto('/in/tests', testFiles, 'tests')]

const manifest = rulesetManifestSchema.parse({
    schemaVersion: 1,
    version,
    env: 'dev',
    createdAt: new Date().toISOString(),
    author: { userId: null, name: 'local run' },
    changeNote: 'local run-local staging',
    source: null,
    files,
})
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify(manifest))
console.error(`staged ${files.length} files as ${version}`)
