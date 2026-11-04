import * as fs from 'fs'
import * as path from 'path'

export interface SemgrepFinding {
    check_id: string
    path: string
    start: { line: number }
    extra: { severity: string; message: string }
}

export interface SemgrepError {
    type?: unknown
    message?: string
    path?: string
}

export interface SemgrepOutput {
    results?: SemgrepFinding[]
    errors?: SemgrepError[]
    paths?: { scanned?: string[] }
}

/**
 * The states a Semgrep run can end in. "No findings" is only claimed on positive evidence: an R or
 * Python file was parsed and every rule finished on every file. A rule that times out or a file that
 * fails to parse leaves part of the submission unexamined, which is not clean.
 */
export type SemgrepOutcome =
    | 'FINDINGS-FOUND'
    | 'NO-FINDINGS'
    | 'PARTIALLY-SCANNED'
    | 'NOTHING-SCANNED'
    | 'DID-NOT-COMPLETE'

export function prepareSemgrepReport(jsonPath: string): void {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true })
    fs.rmSync(jsonPath, { force: true })
}

// The relative targets Semgrep is given, run from the work dir. Paths in its report start with these,
// and submissionPath() maps them back to the researcher's own file names.
export const SUBMISSION_ROOT = 'src'
export const NOTEBOOK_ROOT = 'notebooks'

const NOTEBOOK_FILE = /\.(rmd|rmarkdown|qmd)$/i
const JUPYTER_FILE = /\.ipynb$/i
const STARTUP_FILE = /^(\.Rprofile|Rprofile\.site)$/i
const CODE_FILE = /\.(r|py)$/i
const GATING_SEVERITIES = new Set(['ERROR', 'WARNING'])
const MAX_LINES_PER_SECTION = 200

type Language = 'R' | 'py'
const LANGUAGES: Language[] = ['R', 'py']

// knitr's chunk syntax: an optional indent or blockquote prefix, and no nesting. A chunk header
// inside any other fence still starts a chunk, and only a bare fence ends one.
const CHUNK_BEGIN = /^([\t >]*)(?:`{3,}|~{3,})\s*\{\s*([a-z0-9_]+)(.*)$/i
const CHUNK_END = /^[\t >]*(?:`{3,}|~{3,})\s*$/
const CHUNK_ENGINE_OPTION = /\bengine\s*=\s*["']?([a-z0-9_]+)/i

// knitr's `r expr` and Quarto's `{r} expr`; both may continue onto the next line.
const INLINE_CODE: Record<Language, RegExp> = {
    R: /`(?:r[ \t#]|\{r\})([^`]+)`/g,
    py: /`\{python\}([^`]+)`/g,
}

// Cell magics whose body is still Python. Other cell magics run another language, and
// notebook-shell-magic reports them.
const PYTHON_CELL_MAGIC = /^%%(time|timeit|capture|prun)\b/

function engineLanguage(engine: string): Language | undefined {
    if (/^r$/i.test(engine)) return 'R'
    if (/^python$/i.test(engine)) return 'py'
    return undefined
}

function chunkLanguage(engine: string, options: string): Language | undefined {
    return engineLanguage(options.match(CHUNK_ENGINE_OPTION)?.[1] ?? engine)
}

/**
 * Semgrep cannot parse R Markdown or Quarto, and reports `Targets scanned: 0` for them. This keeps
 * every line of the chunks in one language where it is and blanks every other line, so the result
 * parses as plain R (or Python) and a finding's line number is already the notebook's line number.
 * Inline expressions stay on the line where they start, separated by semicolons.
 */
export function extractNotebookCode(source: string, language: Language): string {
    const lines = source.split('\n')
    const code = lines.map(() => '')
    const prose = [...lines]
    let chunk: { language?: Language; prefix: string } | undefined
    lines.forEach((line, i) => {
        const begin = line.match(CHUNK_BEGIN)
        if (begin) {
            chunk = { language: chunkLanguage(begin[2], begin[3]), prefix: begin[1] }
        } else if (chunk && CHUNK_END.test(line)) {
            chunk = undefined
        } else if (!chunk) {
            return
        } else if (chunk.language === language) {
            code[i] = line.startsWith(chunk.prefix) ? line.slice(chunk.prefix.length) : line
        }
        prose[i] = ''
    })

    const text = prose.join('\n')
    let line = 0
    let counted = 0
    for (const match of text.matchAll(INLINE_CODE[language])) {
        for (; counted < match.index; counted++) if (text[counted] === '\n') line++
        match[1].split('\n').forEach((part, offset) => {
            const expression = part.trim()
            if (!expression) return
            const at = line + offset
            code[at] = code[at] ? `${code[at]}; ${expression}` : expression
        })
    }
    return code.join('\n')
}

interface JupyterNotebook {
    cells?: { cell_type?: string; source?: string | string[] }[]
    metadata?: { kernelspec?: { language?: string }; language_info?: { name?: string } }
}

function notebookCellLines(source: string | string[] | undefined, language: Language): string[] {
    const lines = (Array.isArray(source) ? source.join('') : (source ?? '')).split('\n')
    if (language !== 'py') return lines
    if (lines[0]?.startsWith('%%') && !PYTHON_CELL_MAGIC.test(lines[0])) return []
    // IPython `!` and `%` lines are not Python. notebook-shell-magic reports the ones that run commands.
    return lines.map((l) => (/^\s*[!%]/.test(l) ? '' : l))
}

function jsonStringAt(rawLine: string): string | undefined {
    const value = rawLine.trim().replace(/,$/, '')
    if (!value.startsWith('"')) return undefined
    try {
        return JSON.parse(value) as string
    } catch {
        return undefined
    }
}

/**
 * Puts each code cell line on the line of the .ipynb file that holds it, which is where Jupyter
 * writes it (one source string per line). A cell in any other layout goes after the last line, so
 * its code is still scanned, but its line numbers point past the end of the file.
 */
export function extractJupyterCode(text: string): { language?: Language; code: string } | undefined {
    let notebook: JupyterNotebook
    try {
        notebook = JSON.parse(text) as JupyterNotebook
    } catch {
        return undefined
    }
    const kernel = notebook.metadata?.kernelspec?.language ?? notebook.metadata?.language_info?.name ?? 'python'
    const language = engineLanguage(kernel)
    if (!language) return { code: '' }

    const raw = text.split('\n')
    const code = raw.map(() => '')
    const unplaced: string[] = []
    let cursor = 0
    for (const cell of notebook.cells ?? []) {
        if (cell.cell_type !== 'code') continue
        const lines = notebookCellLines(cell.source, language)
        const placed: number[] = []
        let at = cursor
        for (const line of lines) {
            if (!line.trim()) continue
            while (at < raw.length && jsonStringAt(raw[at])?.replace(/\n$/, '') !== line) at++
            if (at === raw.length) break
            placed.push(at++)
        }
        const content = lines.filter((l) => l.trim())
        if (placed.length === content.length) {
            placed.forEach((index, i) => (code[index] = content[i]))
            cursor = at
        } else {
            unplaced.push(...lines, '')
        }
    }
    return { language, code: [...code, ...unplaced].join('\n') }
}

function writeExtract(outDir: string, relative: string, language: Language, code: string): boolean {
    if (!code.trim()) return false
    const target = path.join(outDir, `${relative}.${language}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, code)
    return true
}

export function extractNotebooks(root: string, outDir: string): number {
    fs.mkdirSync(outDir, { recursive: true })
    let extracted = 0
    for (const relative of fs.readdirSync(root, { recursive: true, encoding: 'utf-8' })) {
        const notebook = NOTEBOOK_FILE.test(relative)
        const jupyter = JUPYTER_FILE.test(relative)
        if (!notebook && !jupyter && !STARTUP_FILE.test(path.basename(relative))) continue
        const source = path.join(root, relative)
        if (!fs.statSync(source).isFile()) continue

        const text = fs.readFileSync(source, 'utf-8')
        if (notebook) {
            for (const language of LANGUAGES) {
                if (writeExtract(outDir, relative, language, extractNotebookCode(text, language))) extracted++
            }
        } else if (jupyter) {
            const cells = extractJupyterCode(text)
            if (cells?.language && writeExtract(outDir, relative, cells.language, cells.code)) extracted++
        } else if (writeExtract(outDir, relative, 'R', text)) {
            extracted++
        }
    }
    return extracted
}

export function submissionPath(reported: string): string {
    if (reported.startsWith(`${NOTEBOOK_ROOT}/`)) {
        return reported.slice(NOTEBOOK_ROOT.length + 1).replace(/\.(R|py)$/, '')
    }
    if (reported.startsWith(`${SUBMISSION_ROOT}/`)) return reported.slice(SUBMISSION_ROOT.length + 1)
    return reported
}

// Semgrep prefixes each rule id with the path of the file that defined it.
export function ruleName(checkId: string): string {
    return checkId.split('.').pop() ?? checkId
}

// A notebook's regex rules (credential formats) fire on both the notebook and its extract, so the
// same finding arrives twice once both paths are mapped back.
export function semgrepFindings(data: SemgrepOutput): SemgrepFinding[] {
    const seen = new Set<string>()
    const findings: SemgrepFinding[] = []
    for (const r of data.results ?? []) {
        const finding = { ...r, check_id: ruleName(r.check_id), path: submissionPath(r.path) }
        const key = `${finding.check_id}\0${finding.path}\0${finding.start.line}`
        if (seen.has(key)) continue
        seen.add(key)
        findings.push(finding)
    }
    return findings.sort((a, b) => a.path.localeCompare(b.path) || a.start.line - b.start.line)
}

function scannedCodeFiles(data: SemgrepOutput): string[] {
    const files = (data.paths?.scanned ?? []).filter((p) => CODE_FILE.test(p)).map(submissionPath)
    return [...new Set(files)].sort()
}

export function semgrepOutcome(
    data: SemgrepOutput | null,
    findings = data ? semgrepFindings(data) : [],
    files = data ? scannedCodeFiles(data) : [],
): SemgrepOutcome {
    if (!data) return 'DID-NOT-COMPLETE'
    if (findings.some((f) => GATING_SEVERITIES.has(f.extra.severity))) return 'FINDINGS-FOUND'
    if (files.length === 0) return 'NOTHING-SCANNED'
    if (data.errors?.length) return 'PARTIALLY-SCANNED'
    return 'NO-FINDINGS'
}

const SEMGREP_OUTCOME_PHRASES: Record<SemgrepOutcome, string> = {
    'FINDINGS-FOUND': 'findings found',
    'NO-FINDINGS': 'no findings',
    'PARTIALLY-SCANNED': 'partially scanned',
    'NOTHING-SCANNED': 'nothing scanned',
    'DID-NOT-COMPLETE': 'scan did not complete',
}

function capped(lines: string[]): string[] {
    if (lines.length <= MAX_LINES_PER_SECTION) return lines
    const rest = lines.length - MAX_LINES_PER_SECTION
    return [...lines.slice(0, MAX_LINES_PER_SECTION), `  ... ${rest} more in semgrep.json`]
}

function errorKind(error: SemgrepError): string {
    const kind = Array.isArray(error.type) ? error.type[0] : error.type
    return typeof kind === 'string' ? kind : 'error'
}

/**
 * The reviewer-facing log. The first line is the machine-readable status the management app parses;
 * everything after it is for a person. Findings name the file, line, and rule but never quote the
 * matched code, which could be student data.
 */
export function semgrepPlaintextLog(data: SemgrepOutput | null): string {
    const findings = data ? semgrepFindings(data) : []
    const files = data ? scannedCodeFiles(data) : []
    const status = `Semgrep Scan: ${SEMGREP_OUTCOME_PHRASES[semgrepOutcome(data, findings, files)]}`
    if (!data) return status

    const row = (f: SemgrepFinding) => `  ${f.path}:${f.start.line}  ${f.extra.severity.padEnd(7)}  ${f.check_id}`
    const gating = findings.filter((f) => GATING_SEVERITIES.has(f.extra.severity))
    const info = findings.filter((f) => !GATING_SEVERITIES.has(f.extra.severity))

    const lines = [status, `R and Python files analyzed: ${files.length}`]
    if (files.length) lines.push(...capped(files.map((f) => `  ${f}`)))
    if (gating.length) lines.push('', 'Findings that fail the review gate:', ...capped(gating.map(row)))
    if (info.length) lines.push('', 'For review, not failing the gate:', ...capped(info.map(row)))

    const errors = data.errors ?? []
    if (errors.length) {
        const unanalyzed = errors.map((e) => `  ${e.path ? submissionPath(e.path) : '(no file)'}: ${errorKind(e)}`)
        lines.push('', 'Not fully analyzed:', ...capped([...new Set(unanalyzed)]))
    }

    const messages = new Map(findings.map((f) => [f.check_id, f.extra.message]))
    if (messages.size) {
        lines.push('', 'Rules:')
        for (const [rule, message] of [...messages].sort()) lines.push(`  ${rule}: ${message}`)
    }
    return lines.join('\n')
}
