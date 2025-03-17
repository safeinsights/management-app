import { TextInput as MantineTextInput, TextInputProps } from '@mantine/core'
import { cva, cx, css } from '@/styles'

type TextInputVariantProps = {
    horizontal?: boolean
}

const styles = cva({
    base: {
        display: 'flex',
        gap: 'var(--mantine-spacing-md)',
    },
    variants: {
        direction: {
            horizontal: {
                flexDirection: 'row',
                alignItems: 'center',
            },
            vertical: {
                flexDirection: 'column',
            },
        },
    }
})

export const TextInput: React.FC<TextInputProps & TextInputVariantProps> = ({ className, horizontal, ...inputProps}) => {
    return <MantineTextInput {...inputProps} className={cx(styles({ direction: horizontal ? 'horizontal' : 'vertical' }), className)} />
}
