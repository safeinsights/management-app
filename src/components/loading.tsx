import { Flex, Loader as Spinner, Text, type TextProps } from '@mantine/core'

export const LoadingMessage: React.FC<{ message: string; isVisible?: boolean } & TextProps> = ({
    message,
    isVisible,
    ...textProps
}) => {
    if (isVisible === false) return null

    return (
        <Flex align="center">
            <Spinner color={'blue'} />
            <Text component="span" {...textProps}>
                {message}
            </Text>
        </Flex>
    )
}
