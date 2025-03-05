import { css } from '@/styles'

export const studyRowStyle = css({
    padding: '1rem',
    // border: '2px solid black',
    borderBottom: 'none',
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 80px 200px',
    gap: '1rem',
    _last: {
        borderBottom: '2px solid black',
    },
})

export const studyStatusStyle = css({
    fontSize: '80%',
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: '1rem',
    paddingRight: '1rem',
    borderLeft: '1px solid #ccc', // Right border on the first cell
})

export const studyTitleStyle = css({
    borderRight: '1px solid #ccc', // Right border on the first cell
})

export const studyLinkStyle = css({
    paddingLeft: '20px',
})

export const iconRightSpacing = css({
    marginRight: '4px',
})

export const studyRowHeaderStyle = css({
    backgroundColor: '#D9D9D9',
    // display: 'block',
    // paddingTop: '0.5rem',
    // paddingBottom: '0.5rem',
    fontSize: '14px',
    fontFamily: 'Roboto, monospace',
})

export const tableHeaderStyle = css({
    display: 'flex',
    justifyContent: 'space-between',
    paddingLeft: '16px',
    paddingRight: '16px',
    textAlign: 'center',
})

export const studyFontSize = css({
    fontSize: '14px',
})

export const statusBannerStyle = css({
    width:'30%',
    backgroundColor: '#D9D9D9',
    textAlign: 'left',
    fontFamily: 'Roboto, monospace',
    marginTop: '0',
    borderRadius: '2px',
})

