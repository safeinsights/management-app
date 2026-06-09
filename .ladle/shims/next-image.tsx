// Shim for `next/image` — Ladle has no Next.js image optimizer, so render a plain
// <img> with the same src/alt/width/height. Drops next-only props without warnings.
import type { ImgHTMLAttributes } from 'react'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
    src: string | { src: string }
    alt: string
    width?: number | string
    height?: number | string
    priority?: boolean
    fill?: boolean
    sizes?: string
    quality?: number
    placeholder?: 'blur' | 'empty'
    blurDataURL?: string
}

export default function Image({
    src,
    alt,
    width,
    height,
    priority,
    fill,
    sizes,
    quality,
    placeholder,
    blurDataURL,
    style,
    ...rest
}: Props) {
    void priority
    void quality
    void placeholder
    void blurDataURL
    const srcStr = typeof src === 'string' ? src : src.src
    const fillStyle = fill ? { position: 'absolute' as const, inset: 0, width: '100%', height: '100%' } : undefined
    return (
        <img
            src={srcStr}
            alt={alt}
            width={fill ? undefined : width}
            height={fill ? undefined : height}
            sizes={sizes}
            style={{ ...fillStyle, ...style }}
            {...rest}
        />
    )
}
