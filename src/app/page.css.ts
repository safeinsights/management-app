import { style } from '@vanilla-extract/css'

export const pageStyles = style({
    display: 'grid',
    gridTemplateRows: '1fr 20px',
    alignItems: 'center',
    justifyItems: 'center',
    minHeight: '100svh',
    padding: 80,
    gap: 64,
    fontSynthesis: 'none',
})

export const mainStyles = style({
    display: 'flex',
    flexDirection: 'column',
    fontSize: 20,
    fontWeight: 'bold',
    gap: 32,
})

export const footerStyles = style({
    fontSize: '80%',
    fontStyle: 'oblique',
})
