import { showToast } from '@/components/toast-notifications'
import { FileWithPath } from '@mantine/dropzone'

export const handleDuplicateUpload = (mainFile: File | null, additionalFiles: FileWithPath[] | null): boolean => {
    if (!mainFile || !additionalFiles) return false

    const duplicateFound = additionalFiles.some((file) => file.name === mainFile.name)

    if (duplicateFound) {
        showToast({
            category: 'error',
            title: 'Duplicate filename',
            message: `The file name "${mainFile.name}" has already been uploaded. Please choose a different file name or remove the existing one before continuing.`,
        })
    }

    return duplicateFound
}
