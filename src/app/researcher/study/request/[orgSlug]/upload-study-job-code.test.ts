import { describe, it, expect, vi } from 'vitest'
import { notifications } from '@mantine/notifications'
import { handleDuplicateUpload } from '@/app/researcher/utils/file-upload'

const createFile = (name: string): File => new File(['test'], name)

describe('handleDuplicateUpload', () => {
    const notificationsSpy = vi.spyOn(notifications, 'show').mockImplementation(() => '')

    it('returns false when mainFile is null', () => {
        expect(handleDuplicateUpload(null, [createFile('a.R')])).toBe(false)
        expect(notificationsSpy).not.toHaveBeenCalled()
    })

    it('returns false and shows no notification when there is no duplicate', () => {
        const mainFile = createFile('main.R')
        const others = [createFile('script.R')]
        expect(handleDuplicateUpload(mainFile, others)).toBe(false)
        expect(notificationsSpy).not.toHaveBeenCalled()
    })

    it('returns true and triggers notification when duplicate filename exists', () => {
        const mainFile = createFile('main.R')
        const duplicates = [createFile('main.R'), createFile('other.R')]
        expect(handleDuplicateUpload(mainFile, duplicates)).toBe(true)
        expect(notificationsSpy).toHaveBeenCalledWith({
            color: 'red',
            title: 'Duplicate filename',
            message: expect.stringContaining('main.R'),
        })
    })
})
