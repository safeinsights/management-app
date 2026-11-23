// The org list the root layout would pass for the session that mockClerkSession set up.
let mockedLayoutUserInfo: UserInfo | null = null

export const getMockedLayoutUserInfo = () => mockedLayoutUserInfo

export const setMockedLayoutUserInfo = (userInfo: UserInfo | null) => {
    mockedLayoutUserInfo = userInfo
}
