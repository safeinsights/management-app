import { Anchor, type AnchorProps, Group } from '@mantine/core'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { type AnchorHTMLAttributes, type FC, useEffect, useState } from 'react'

type DownloadBlobLinkProps = Omit<
    AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement>,
    'children' | 'download' | 'href'
> & {
    filename: string
    fileContent: BlobPart
}

export const DownloadBlobLink: FC<DownloadBlobLinkProps> = ({ filename, fileContent, ...anchorProps }) => {
    const [href, setHref] = useState('#')

    useEffect(() => {
        const blob = new Blob([fileContent])
        const url = URL.createObjectURL(blob)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHref(url)

        return () => URL.revokeObjectURL(url)
    }, [fileContent])

    return (
        <Anchor {...anchorProps} href={href} download={filename} data-testid="download-link" display="flex">
            <Group component="span" gap="xxs" wrap="nowrap">
                Download <DownloadSimpleIcon size={16} />
            </Group>
        </Anchor>
    )
}
