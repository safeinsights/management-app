import { notifications } from '@mantine/notifications'
import { FileDocIcon, FilePdfIcon, FileTextIcon, UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { useMantineTheme } from '@mantine/core'
import React from 'react'
import { FileWithPath } from '@mantine/dropzone'

// Detects if any uploaded files share the same name as the main code file and shows a notification.
export const handleDuplicateUpload = (mainFile: File | null, additionalFiles: FileWithPath[] | null): boolean => {
    if (!mainFile || !additionalFiles) return false

    const duplicateFound = additionalFiles.some((file) => file.name === mainFile.name)

    if (duplicateFound) {
        notifications.show({
            color: 'red',
            title: 'Duplicate filename',
            message: `The file name "${mainFile.name}" has already been uploaded. Please choose a different file name or remove the existing one before continuing.`,
        })
    }

    return duplicateFound
}

export const useFileUploadIcons = () => {
    const theme = useMantineTheme()
    const getFileUploadIcon = (color: string, fileName?: string | null) => {
        if (!fileName) return <UploadSimpleIcon size={14} color={theme.colors.purple[5]} weight="fill" />
        const Icons: [RegExp, React.ReactNode][] = [
            [/\.docx?$/i, <FileDocIcon key="doc" size={14} color={color} />],
            [/\.txt$/i, <FileTextIcon key="txt" size={14} color={color} />],
            [/\.pdf$/i, <FilePdfIcon key="pdf" size={14} color={color} />],
        ]
        const matchedIcon = Icons.find(([re]) => re.test(fileName))?.[1]
        return matchedIcon || <UploadSimpleIcon size={14} color={color} weight="fill" />
    }
    return { getFileUploadIcon }
}
