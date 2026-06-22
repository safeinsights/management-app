import { useEffect, useState } from 'react'
import { Center, Group, Image } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { DownloadBlobLink } from '@/components/download-blob-link'

type ImagePreviewModalProps = {
    isVisible: boolean
    name: string
    contents: ArrayBuffer
    mime: string | null
    onClose: () => void
}

export function ImagePreviewModal({ isVisible, name, contents, mime, onClose }: ImagePreviewModalProps) {
    const [src, setSrc] = useState('')

    useEffect(() => {
        if (!mime) return
        const url = URL.createObjectURL(new Blob([contents], { type: mime }))
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSrc(url)
        return () => URL.revokeObjectURL(url)
    }, [contents, mime])

    if (!isVisible || !mime) return null

    const title = (
        <Group gap="md" align="baseline">
            <span>{name}</span>
            <DownloadBlobLink filename={name} fileContent={contents} size="sm" fw={400} />
        </Group>
    )

    return (
        <AppModal isOpen onClose={onClose} title={title} size="xl">
            <Center>{src && <Image src={src} alt={name} fit="contain" mah={600} />}</Center>
        </AppModal>
    )
}
