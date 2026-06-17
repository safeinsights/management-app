import { useEffect, useState } from 'react'
import { Center, Group, Image } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { DownloadBlobLink } from '@/components/download-blob-link'

type ImagePreviewModalProps = {
    name: string
    contents: ArrayBuffer
    mime: string
    onClose: () => void
}

export function ImagePreviewModal({ name, contents, mime, onClose }: ImagePreviewModalProps) {
    const [src, setSrc] = useState('')

    useEffect(() => {
        const url = URL.createObjectURL(new Blob([contents], { type: mime }))
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSrc(url)
        return () => URL.revokeObjectURL(url)
    }, [contents, mime])

    const title = (
        <Group gap="md" align="baseline">
            <span>{name}</span>
            <DownloadBlobLink filename={name} fileContent={contents} size="sm" fw={400} />
        </Group>
    )

    return (
        <AppModal isOpen onClose={onClose} title={title} size="xl">
            <Center>
                <Image src={src} alt={name} fit="contain" mah={600} />
            </Center>
        </AppModal>
    )
}
