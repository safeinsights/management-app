'use client'

import { useRef, useState, type FC } from 'react'
import dynamic from 'next/dynamic'
import { ActionIcon, AspectRatio, Center, Group, Stack, Text } from '@mantine/core'
import { PlayIcon } from '@phosphor-icons/react/dist/ssr'
import { IDE_ONBOARDING_VIDEO_URL } from '@/lib/config'
import { fontWeight, semanticColor } from '@/theme/tokens'

// Not fetched until Play is pressed, so a researcher who never watches doesn't download the player.
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false })

const VIDEO_TITLE = 'Watch: Getting started with the SafeInsights IDE'

/** Figma's teaser thumbnail is 220×124, i.e. 16:9 at that width. */
const THUMBNAIL_WIDTH = 220
const PLAY_BUTTON_SIZE = 40

const VideoHeading: FC = () => (
    <Stack gap="xxs">
        <Text fz="sm" fw={fontWeight.bold} lh={1.2} c={semanticColor('text.primary')}>
            {VIDEO_TITLE}
        </Text>
        <Text fz="sm" c={semanticColor('text.secondary')}>
            A short walkthrough of the IDE, example data, and code submission.
        </Text>
    </Stack>
)

const OnboardingVideoTeaser: FC<{ isVisible: boolean; onPlay: () => void }> = ({ isVisible, onPlay }) => {
    if (!isVisible) return null

    return (
        <Group
            gap={0}
            wrap="nowrap"
            align="flex-start"
            bg={semanticColor('surface.raised')}
            bd={`1px solid ${semanticColor('border.default')}`}
            data-testid="onboarding-video-teaser"
        >
            <AspectRatio ratio={16 / 9} w={THUMBNAIL_WIDTH} miw={THUMBNAIL_WIDTH} bg={semanticColor('brand.default')}>
                <Center>
                    <ActionIcon
                        aria-label={`Play video: ${VIDEO_TITLE}`}
                        onClick={onPlay}
                        size={PLAY_BUTTON_SIZE}
                        radius="xl"
                        variant="transparent"
                        bg={semanticColor('brand.accentalpha')}
                    >
                        <PlayIcon size={20} weight="fill" color={semanticColor('text.white')} aria-hidden />
                    </ActionIcon>
                </Center>
            </AspectRatio>
            <Stack px="md" pt="md">
                <VideoHeading />
            </Stack>
        </Group>
    )
}

// vimeo-video-element builds its iframe inside a shadow root with no title, so screen readers would
// announce an unnamed frame. Vimeo's own embed snippet titles it, so we add that once it exists.
function useTitledVimeoIframe() {
    const ref = useRef<HTMLVideoElement>(null)
    const onReady = () => {
        ref.current?.shadowRoot?.querySelector('iframe')?.setAttribute('title', 'SafeInsights IDE Orientation')
    }
    return { ref, onReady }
}

const OnboardingVideoPlayer: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    const { ref, onReady } = useTitledVimeoIframe()
    if (!isVisible) return null

    return (
        <Stack gap="md" data-testid="onboarding-video-player">
            <VideoHeading />
            <AspectRatio ratio={16 / 9} w="100%">
                <ReactPlayer
                    ref={ref}
                    src={IDE_ONBOARDING_VIDEO_URL}
                    playing
                    controls
                    width="100%"
                    height="100%"
                    onReady={onReady}
                    config={{ vimeo: { autopause: false, referrerpolicy: 'strict-origin-when-cross-origin' } }}
                />
            </AspectRatio>
        </Stack>
    )
}

function useOnboardingVideo() {
    const [isPlaying, setIsPlaying] = useState(false)
    return { isPlaying, play: () => setIsPlaying(true) }
}

const OnboardingVideoContent: FC = () => {
    const { isPlaying, play } = useOnboardingVideo()

    return (
        <>
            <OnboardingVideoTeaser isVisible={!isPlaying} onPlay={play} />
            <OnboardingVideoPlayer isVisible={isPlaying} />
        </>
    )
}

// The play state lives a level down so collapsing the accordion unmounts it: reopening shows the
// teaser again rather than restarting the video unprompted.
export const OnboardingVideo: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return <OnboardingVideoContent />
}
