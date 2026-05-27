import { Language } from '@/database/types'
import { ACCEPTED_FILE_TYPES, ACCEPTED_LANGUAGE_FILE_TYPES } from './types'
import { toSentence } from './string'

export const languageLabels: Record<Language, string> = {
    R: 'R',
    PYTHON: 'Python',
}

const ACCEPTED_FILE_TYPE_LABELS: Record<Language, string[]> = {
    R: ['.r', '.rmd'],
    PYTHON: ['.py', '.ipynb'],
}

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

export const getAcceptedFormatsForLanguage = (language: Language): string => {
    const extensions = ACCEPTED_FILE_TYPE_LABELS[language]
    if (extensions) {
        return `Accepted formats: ${toSentence(extensions)}`
    }
    const allExtensions = Object.values(ACCEPTED_FILE_TYPE_LABELS).flat()
    return `Accepted formats: ${toSentence(allExtensions)}`
}

export const getAcceptedFileTypesForLanguage = (language: Language): Record<string, string[]> => {
    return ACCEPTED_LANGUAGE_FILE_TYPES[language] ?? ACCEPTED_FILE_TYPES
}
