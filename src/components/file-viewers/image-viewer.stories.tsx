import type { Story } from '@ladle/react'
import { Box } from '@mantine/core'
import { ImageViewer } from './image-viewer'

// ImageViewer is presentational: it takes raw image bytes + a mime type and renders
// them through an object URL. A tiny inline png keeps the story self-contained.
const meta = { title: 'File viewers / Image viewer' }
export default meta

const ONE_BY_ONE_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function pngBytes(): ArrayBuffer {
    const binary = atob(ONE_BY_ONE_PNG_BASE64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
}

export const PngPlot: Story = () => (
    <Box p="xl">
        <ImageViewer name="plot.png" contents={pngBytes()} mime="image/png" />
    </Box>
)
