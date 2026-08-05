import { NextRequest, NextResponse } from "next/server";

/**
 * Spotify redirects to this same-origin endpoint after authorization. The
 * browser-held PKCE verifier and state remain in sessionStorage, so the route
 * forwards only Spotify's public callback parameters to the client application.
 * The client then verifies state and exchanges the code without a client secret.
 */
export function GET(request: NextRequest) {
  const destination = new URL("/", request.url);
  for (const parameter of ["code", "state", "error"]) {
    const value = request.nextUrl.searchParams.get(parameter);
    if (value) destination.searchParams.set(parameter, value);
  }
  return NextResponse.redirect(destination);
}
