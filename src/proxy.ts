import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/irrigacao', '/admin'];
const LOGIN_PATH = '/login';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if this is a protected path
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!isProtected) {
    return NextResponse.next();
  }

  // Check for NextAuth session token (both secure and non-secure variants)
  const sessionToken =
    request.cookies.get('next-auth.session-token')?.value ||
    request.cookies.get('__Secure-next-auth.session-token')?.value;

  if (!sessionToken) {
    // Not logged in: redirect to login page
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Token exists — allow through (NextAuth will validate it on the page/API level)
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/irrigacao/:path*',
    '/admin/:path*',
  ],
};
