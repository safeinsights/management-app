import { useMantineTheme } from '@mantine/core'
import { FileDocIcon, FilePdfIcon, FileTextIcon, UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr'

export function useFileTypeIcon(fileName?: string | null) {
    const theme = useMantineTheme()

    if (!fileName) {
        return <UploadSimpleIcon size={14} color={theme.colors.purple[5]} weight="fill" />
    }

    const color = theme.colors.blue[7]
    const iconMap: [RegExp, React.ReactNode][] = [
        [/\.docx?$/i, <FileDocIcon key="doc" size={14} color={color} />],
        [/\.txt$/i, <FileTextIcon key="txt" size={14} color={color} />],
        [/\.pdf$/i, <FilePdfIcon key="pdf" size={14} color={color} />],
    ]

    const matchedIcon = iconMap.find(([pattern]) => pattern.test(fileName))?.[1]
    return matchedIcon || <UploadSimpleIcon size={14} color={color} weight="fill" />
}
