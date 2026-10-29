'use client'

import { useState, type FC } from 'react'
import { ActionIcon, AspectRatio, Box, Center, Group, Stack, Text } from '@mantine/core'
import { PlayIcon } from '@phosphor-icons/react/dist/ssr'
import { IDE_ONBOARDING_VIDEO_EMBED_URL } from '@/lib/config'
import { fontWeight, semanticColor } from '@/theme/tokens'

const VIDEO_TITLE = 'Watch: Getting started with the SafeInsights IDE'

/** Figma's teaser thumbnail is 220×124, i.e. 16:9 at that width. */
const THUMBNAIL_WIDTH = 220
const PLAY_BUTTON_SIZE = 40

const VideoHeading: FC = () => (
    <Stack gap="xxs">
        <Text fz="sm" fw={fontWeight.bold} lh="var(--si-line-height-tight)" c={semanticColor('text.primary')}>
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

// The iframe mounts only after Play, so a researcher who never watches doesn't load the player.
const OnboardingVideoPlayer: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <Stack gap="md" data-testid="onboarding-video-player">
            <VideoHeading />
            <AspectRatio ratio={16 / 9} w="100%">
                <Box
                    component="iframe"
                    src={IDE_ONBOARDING_VIDEO_EMBED_URL}
                    title="SafeInsights IDE Orientation"
                    allow="autoplay; fullscreen; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    bd="none"
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
