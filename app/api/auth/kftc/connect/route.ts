import { auth } from "@/auth";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.redirect(
      new URL("/login", process.env.AUTH_URL ?? "http://localhost:3000")
    );
  }

  const clientId = process.env.KFTC_CLIENT_ID;
  const baseUrl = process.env.KFTC_BASE_URL;
  const redirectUri = process.env.KFTC_REDIRECT_URI;

  if (!clientId || !baseUrl || !redirectUri) {
    return NextResponse.json(
      { error: "KFTC 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  // 32자리 state
  const state = crypto.randomBytes(16).toString("hex");

  const authorizeUrl = new URL(
    "/oauth/2.0/authorize",
    baseUrl
  );

  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);

  // 조회만 필요하므로 최소 권한
  authorizeUrl.searchParams.set("scope", "login inquiry");

  authorizeUrl.searchParams.set("state", state);

  // 최초 인증
  authorizeUrl.searchParams.set("auth_type", "0");

  const response = NextResponse.redirect(authorizeUrl);

  response.cookies.set("kftc_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  return response;
}