import { useEffect, useState, type FC } from 'react'
import { Center, Image } from '@mantine/core'

type ImageViewerProps = {
    name: string
    contents: ArrayBuffer
    mime: string
}

export const ImageViewer: FC<ImageViewerProps> = ({ name, contents, mime }) => {
    const [src, setSrc] = useState('')

    useEffect(() => {
        const url = URL.createObjectURL(new Blob([contents], { type: mime }))
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSrc(url)
        return () => URL.revokeObjectURL(url)
    }, [contents, mime])

    return <Center>{src && <Image src={src} alt={name} fit="contain" mah={600} />}</Center>
}
