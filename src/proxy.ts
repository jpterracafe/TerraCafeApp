import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PROTECTED_PATHS = ['/irrigacao', '/admin'];
const LOGIN_PATH = '/login';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if this is a protected path
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!isProtected) {
    return NextResponse.next();
  }

  // Valida assinatura/expiração do JWT (não só existência do cookie).
  // Sessões legítimas continuam passando; token forjado/expirado cai no login.
  try {
    const token = await getToken({
      req: request as unknown as Parameters<typeof getToken>[0]["req"],
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (token) {
      return NextResponse.next();
    }
  } catch {
    // Em caso de erro de validação, segue para o fallback abaixo (redirect).
  }

  // Fallback compatível: se getToken não resolveu (ex.: secret ausente em dev),
  // mantém o comportamento antigo de checar existência do cookie para não
  // derrubar o sistema; a validação definitiva ocorre na página/API.
  const sessionToken =
    request.cookies.get('next-auth.session-token')?.value ||
    request.cookies.get('__Secure-next-auth.session-token')?.value;

  if (!sessionToken) {
    // Not logged in: redirect to login page
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Token existe mas não pôde ser validado no edge — permite passar e deixa
  // o NextAuth validar na página/API (comportamento anterior preservado).
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/irrigacao/:path*',
    '/admin/:path*',
  ],
};
