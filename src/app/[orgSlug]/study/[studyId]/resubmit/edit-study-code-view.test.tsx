import { describe, expect, it } from 'vitest'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { NO_CHANGES_MESSAGE, SELECT_MAIN_FILE_MESSAGE } from '@/components/study/submit-code-error'
import { resubmitBlockedReason } from './edit-study-code-view'

const ide = (overrides: Partial<StudyCodeIDE>) => overrides as StudyCodeIDE

describe('resubmitBlockedReason', () => {
    it('asks for files when the workspace is empty', () => {
        expect(resubmitBlockedReason(ide({ files: [], mainFile: '' }))).toBe(NO_CHANGES_MESSAGE)
    })

    it('asks for a main file when files are present without one', () => {
        expect(resubmitBlockedReason(ide({ files: ['a.R'], mainFile: '' }))).toBe(SELECT_MAIN_FILE_MESSAGE)
    })

    it('lets a complete workspace through', () => {
        expect(resubmitBlockedReason(ide({ files: ['a.R'], mainFile: 'a.R' }))).toBeNull()
    })

    // The Submit code page also refuses an unchanged workspace. This page must not: the researcher
    // may be resubmitting with only a note, and filesChanged is unreliable here anyway (OTTER-558).
    it('allows a resubmission that changed nothing but the note', () => {
        expect(resubmitBlockedReason(ide({ files: ['a.R'], mainFile: 'a.R', filesChanged: false }))).toBeNull()
    })
})
