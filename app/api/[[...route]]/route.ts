import { getServer } from '@/bootstrap/server'

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

const handle = (request: Request) => getServer().api.fetch(request)

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
