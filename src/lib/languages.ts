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

const HIGHLIGHT_LANGUAGES: Record<string, 'python' | 'r'> = {
    '.r': 'r',
    '.rmd': 'r',
    '.py': 'python',
    '.ipynb': 'python',
}

export function highlightLanguageForFile(fileName: string): 'python' | 'r' {
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    return HIGHLIGHT_LANGUAGES[ext] ?? 'r'
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
