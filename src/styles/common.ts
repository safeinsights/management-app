import { css } from './generated/css'

export const pageStyles = css({
    display: 'grid',
    gridTemplateRows: '1fr 20px',
    alignItems: 'center',
    justifyItems: 'center',
    minHeight: '100svh',
    padding: 3,
    gap: '6px',
    fontSynthesis: 'none',
})

export const mainStyles = css({
    display: 'flex',
    flexDirection: 'column',
    fontSize: 20,
    fontWeight: 'bold',
    gap: 32,
})

export const footerStyles = css({
    fontStyle: 'oblique',
})
