import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json(
      {
        success: false,
        stage: "authorization",
        error,
      },
      { status: 400 }
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      {
        success: false,
        error: "Authorization Code 또는 state가 없습니다.",
      },
      { status: 400 }
    );
  }

  const savedState =
    request.cookies.get("kftc_oauth_state")?.value;

  if (!savedState || savedState !== state) {
    return NextResponse.json(
      {
        success: false,
        error: "OAuth state 검증에 실패했습니다.",
      },
      { status: 400 }
    );
  }

  const clientId = process.env.KFTC_CLIENT_ID;
  const clientSecret = process.env.KFTC_CLIENT_SECRET;
  const baseUrl = process.env.KFTC_BASE_URL;
  const redirectUri = process.env.KFTC_REDIRECT_URI;

  if (
    !clientId ||
    !clientSecret ||
    !baseUrl ||
    !redirectUri
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "KFTC 환경변수가 부족합니다.",
      },
      { status: 500 }
    );
  }

  //
  // 1. Authorization Code → Access Token
  //
  const tokenResponse = await fetch(
    `${baseUrl}/oauth/2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    return NextResponse.json(
      {
        success: false,
        stage: "token",
        httpStatus: tokenResponse.status,
        response: tokenData,
      },
      { status: 400 }
    );
  }

  const accessToken = tokenData.access_token;
  const userSeqNo = tokenData.user_seq_no;

  if (!userSeqNo) {
    return NextResponse.json(
      {
        success: false,
        stage: "token",
        error: "user_seq_no가 반환되지 않았습니다.",
      },
      { status: 400 }
    );
  }

  //
  // 2. 사용자정보 + 등록계좌 조회
  //
  const meUrl = new URL(
    "/v2.0/user/me",
    baseUrl
  );

  meUrl.searchParams.set(
    "user_seq_no",
    String(userSeqNo)
  );

  const meResponse = await fetch(meUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const meData = await meResponse.json();

  if (!meResponse.ok) {
    return NextResponse.json(
      {
        success: false,
        stage: "user_info",
        httpStatus: meResponse.status,
        response: meData,
      },
      { status: 400 }
    );
  }

  //
  // Token 원문은 절대로 브라우저에 반환하지 않음
  //
  const accounts = Array.isArray(meData.res_list)
    ? meData.res_list.map((account: any) => ({
        bankName: account.bank_name,
        accountAlias: account.account_alias,
        accountMasked: account.account_num_masked,
        accountType: account.account_type,
        inquiryAgreeYn: account.inquiry_agree_yn,

        // 검증 단계에서는 일부만 표시
        fintechUseNumExists:
          Boolean(account.fintech_use_num),
      }))
    : [];

  const response = NextResponse.json({
    success: true,

    oauth: {
      accessTokenIssued: Boolean(accessToken),
      refreshTokenIssued: Boolean(
        tokenData.refresh_token
      ),
      userSeqNoIssued: Boolean(userSeqNo),
    },

    user: {
      userName: meData.user_name,
      accountCount: accounts.length,
    },

    accounts,
  });

  response.cookies.delete("kftc_oauth_state");

  return response;
}