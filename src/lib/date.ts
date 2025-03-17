import localizedFormat from 'dayjs/plugin/localizedFormat'
import dayjs from 'dayjs'
dayjs.extend(localizedFormat)

export { dayjs }

export function formatDate(date: dayjs.ConfigType) {
    return date ? dayjs(date).format('L LT') : ''
}
