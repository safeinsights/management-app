import { Language } from '@/database/types'

export const languageLabels: Record<Language, string> = {
    R: 'R',
    PYTHON: 'Python',
}

const TEMPLATE_FILE_NAMES: Record<Language, string> = {
    R: 'Main.R',
    PYTHON: 'Main.py',
}

/**
 * OTTER-693: the name the Data Partner's starter file takes in a researcher's workspace. Derived
 * from the language rather than the uploaded name, which the card requires and which keeps the
 * copy and the Template badge reading the same string.
 */
export const templateFileNameFor = (language: Language) => TEMPLATE_FILE_NAMES[language]

export type HighlightLanguage =
    | 'bash'
    | 'c'
    | 'cpp'
    | 'css'
    | 'dockerfile'
    | 'go'
    | 'ini'
    | 'java'
    | 'javascript'
    | 'json'
    | 'julia'
    | 'latex'
    | 'lua'
    | 'makefile'
    | 'markdown'
    | 'matlab'
    | 'perl'
    | 'php'
    | 'plaintext'
    | 'python'
    | 'r'
    | 'ruby'
    | 'rust'
    | 'sas'
    | 'scala'
    | 'sql'
    | 'stata'
    | 'typescript'
    | 'xml'
    | 'yaml'

const HIGHLIGHT_LANGUAGES: Record<string, HighlightLanguage> = {
    '.bash': 'bash',
    '.c': 'c',
    '.cc': 'cpp',
    '.cpp': 'cpp',
    '.cxx': 'cpp',
    '.cs': 'cpp',
    '.css': 'css',
    '.dockerfile': 'dockerfile',
    '.go': 'go',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.htm': 'xml',
    '.html': 'xml',
    '.ini': 'ini',
    '.ipynb': 'python',
    '.java': 'java',
    '.jl': 'julia',
    '.js': 'javascript',
    '.json': 'json',
    '.jsx': 'javascript',
    '.kt': 'java',
    '.lua': 'lua',
    '.m': 'matlab',
    '.makefile': 'makefile',
    '.markdown': 'markdown',
    '.md': 'markdown',
    '.mjs': 'javascript',
    '.pl': 'perl',
    '.php': 'php',
    '.py': 'python',
    '.r': 'r',
    '.rb': 'ruby',
    '.rmd': 'r',
    '.rs': 'rust',
    '.sas': 'sas',
    '.scala': 'scala',
    '.sh': 'bash',
    '.sql': 'sql',
    '.tex': 'latex',
    '.toml': 'ini',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.txt': 'plaintext',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.do': 'stata',
}

export function highlightLanguageForFile(fileName: string): HighlightLanguage {
    const lower = fileName.toLowerCase()
    if (lower === 'dockerfile' || lower.endsWith('/dockerfile')) return 'dockerfile'
    if (lower === 'makefile' || lower.endsWith('/makefile')) return 'makefile'
    const dot = lower.lastIndexOf('.')
    if (dot < 0) return 'plaintext'
    return HIGHLIGHT_LANGUAGES[lower.slice(dot)] ?? 'plaintext'
}
