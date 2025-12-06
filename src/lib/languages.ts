import { Language } from '@/database/types'
import { ACCEPTED_FILE_TYPES } from './types'

export const languageLabels: Record<Language, string> = {
    R: 'R',
    PYTHON: 'Python',
}

export const getAcceptedFormatsForLanguage = (language: Language): string => {
    if (language === 'R') {
        return 'Accepted formats: .r and .rmd'
    }
    if (language === 'PYTHON') {
        return 'Accepted formats: .py and .ipynb'
    }
    return 'Accepted formats: .r, .rmd, .py and .ipynb' // current default
}

export const getAcceptedFileTypesForLanguage = (language: Language): Record<string, string[]> => {
    if (language === 'R') {
        return {
            'application/x-r': ['.r', '.R'],
            'text/x-r': ['.r', '.R'],
            'text/markdown': ['.rmd'],
        }
    }
    if (language === 'PYTHON') {
        return {
            'application/x-python': ['.py'],
            'application/x-ipynb': ['.ipynb'],
        }
    }
    return ACCEPTED_FILE_TYPES // all supported file types
}
