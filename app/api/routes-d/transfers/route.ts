import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    routes: {
      transfers: {
        internal: '/api/routes-d/transfers/internal',
      },
    },
  })
}
