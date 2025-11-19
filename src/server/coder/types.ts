export type CoderBaseEntity = {
    id: string
    name: string
}

export interface CoderWorkspaceEvent {
    latest_build?: {
        resources?: CoderResource[]
        workspace_owner_name?: string
        workspace_name?: string
        status?: string
    }
    id?: string
    url?: string
    message?: string
}

export interface CoderResource {
    agents?: CoderAgent[]
}

export interface CoderAgent {
    lifecycle_state?: string // e.g. "ready", "starting"
    status?: string // e.g. "connected"
    apps?: CoderApp[]
}

export interface CoderApp {
    slug: string // "code-server"
    health?: string // "healthy" | "unhealthy"
}

export interface CoderUserQueryResponse {
    users: CoderUser[]
}

export interface CoderUser {
    id: string
    username: string
    email: string
    name: string
    status: string
}

export interface CoderWorkspace {
    id: string
    name: string
    owner_id: string
    latest_build?: {
        status: string
        resources?: CoderResource[]
    }
}
