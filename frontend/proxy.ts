import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isProtectedPage =
    pathname === "/" ||
    pathname.startsWith("/cabinet") ||
    pathname.startsWith("/equipment") ||
    pathname.startsWith("/reports");

  if (!token && isProtectedPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/cabinet/:path*", "/equipment/:path*", "/reports/:path*", "/login", "/register"],
};
