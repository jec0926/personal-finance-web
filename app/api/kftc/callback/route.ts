import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

//
// KST 기준 현재 일자/시간
//
function getKstDateTime() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const iso = now.toISOString();

  const date = iso.slice(0, 10).replaceAll("-", "");
  const time = iso.slice(11, 19).replaceAll(":", "");

  return {
    date,
    time,
    datetime: `${date}${time}`,
  };
}

//
// KST 기준 N일 전 날짜
//
function getKstDateDaysAgo(days: number) {
  const date = new Date(
    Date.now() +
      9 * 60 * 60 * 1000 -
      days * 24 * 60 * 60 * 1000
  );

  return date
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
}

//
// KFTC 은행거래고유번호 생성
//
// 이용기관코드 10자리
// + U
// + 임의 9자리
// = 총 20자리
//
function makeBankTranId(useOrgCode: string) {
  const randomPart = crypto
    .randomInt(0, 1_000_000_000)
    .toString()
    .padStart(9, "0");

  return `${useOrgCode}U${randomPart}`;
}

export async function GET(request: NextRequest) {
  //
  // 0. 우리 앱 로그인 확인
  //
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      {
        success: false,
        stage: "app_auth",
        error: "로그인이 필요합니다.",
      },
      { status: 401 }
    );
  }

  //
  // 1. KFTC OAuth Callback 파라미터 확인
  //
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const oauthError =
    request.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.json(
      {
        success: false,
        stage: "authorization",
        error: oauthError,
      },
      { status: 400 }
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      {
        success: false,
        stage: "authorization",
        error:
          "Authorization Code 또는 state가 없습니다.",
      },
      { status: 400 }
    );
  }

  //
  // 2. state 검증
  //
  const savedState =
    request.cookies.get("kftc_oauth_state")?.value;

  if (!savedState || savedState !== state) {
    return NextResponse.json(
      {
        success: false,
        stage: "state_validation",
        error: "OAuth state 검증에 실패했습니다.",
      },
      { status: 400 }
    );
  }

  //
  // 3. 환경변수
  //
  const clientId =
    process.env.KFTC_CLIENT_ID?.trim();

  const clientSecret =
    process.env.KFTC_CLIENT_SECRET?.trim();

  const baseUrl =
    process.env.KFTC_BASE_URL?.trim();

  const redirectUri =
    process.env.KFTC_REDIRECT_URI?.trim();

  const useOrgCode =
    process.env.KFTC_USE_ORG_CODE?.trim();

  if (
    !clientId ||
    !clientSecret ||
    !baseUrl ||
    !redirectUri
  ) {
    return NextResponse.json(
      {
        success: false,
        stage: "kftc_config",
        error:
          "KFTC_CLIENT_ID, KFTC_CLIENT_SECRET, KFTC_BASE_URL, KFTC_REDIRECT_URI 중 누락된 값이 있습니다.",
      },
      { status: 500 }
    );
  }

  if (!useOrgCode || useOrgCode.length !== 10) {
    return NextResponse.json(
      {
        success: false,
        stage: "kftc_config",
        error:
          "KFTC_USE_ORG_CODE가 없거나 10자리가 아닙니다.",
      },
      { status: 500 }
    );
  }

  //
  // 4. Authorization Code → Access Token
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

  let tokenData: any;

  try {
    tokenData = await tokenResponse.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        stage: "token",
        error:
          "KFTC Token 응답을 JSON으로 읽지 못했습니다.",
        httpStatus: tokenResponse.status,
      },
      { status: 400 }
    );
  }

  if (
    !tokenResponse.ok ||
    !tokenData.access_token
  ) {
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
        error:
          "Token 응답에 user_seq_no가 없습니다.",
      },
      { status: 400 }
    );
  }

  //
  // 5. 사용자정보 / 등록계좌 조회
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

  let meData: any;

  try {
    meData = await meResponse.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        stage: "user_info",
        error:
          "사용자정보 응답을 JSON으로 읽지 못했습니다.",
        httpStatus: meResponse.status,
      },
      { status: 400 }
    );
  }

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

  const accounts = Array.isArray(
    meData.res_list
  )
    ? meData.res_list
    : [];

  if (accounts.length === 0) {
    return NextResponse.json(
      {
        success: false,
        stage: "account",
        error: "등록된 계좌가 없습니다.",
      },
      { status: 400 }
    );
  }

  //
  // 현재는 검증 목적이므로 첫 번째 계좌 사용
  //
  const firstAccount = accounts[0];

  const fintechUseNum =
    firstAccount.fintech_use_num;

  if (!fintechUseNum) {
    return NextResponse.json(
      {
        success: false,
        stage: "account",
        error:
          "첫 번째 등록계좌에 fintech_use_num이 없습니다.",
      },
      { status: 400 }
    );
  }

  const now = getKstDateTime();

  //
  // 6. 잔액조회
  //
  const balanceUrl = new URL(
    "/v2.0/account/balance/fin_num",
    baseUrl
  );

  balanceUrl.searchParams.set(
    "bank_tran_id",
    makeBankTranId(useOrgCode)
  );

  balanceUrl.searchParams.set(
    "fintech_use_num",
    fintechUseNum
  );

  balanceUrl.searchParams.set(
    "tran_dtime",
    now.datetime
  );

  const balanceResponse = await fetch(
    balanceUrl,
    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${accessToken}`,
      },

      cache: "no-store",
    }
  );

  let balanceData: any;

  try {
    balanceData =
      await balanceResponse.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        stage: "balance",
        error:
          "잔액조회 응답을 JSON으로 읽지 못했습니다.",
        httpStatus: balanceResponse.status,
      },
      { status: 400 }
    );
  }

  //
  // HTTP 200이어도 KFTC rsp_code가
  // 성공이 아닐 수 있으므로 응답을 그대로 확인
  //
  if (
    !balanceResponse.ok ||
    balanceData.rsp_code !== "A0000"
  ) {
    return NextResponse.json(
      {
        success: false,
        stage: "balance",
        httpStatus: balanceResponse.status,

        kftc: {
          rspCode: balanceData.rsp_code,
          rspMessage:
            balanceData.rsp_message,

          bankRspCode:
            balanceData.bank_rsp_code,

          bankRspMessage:
            balanceData.bank_rsp_message,
        },
      },
      { status: 400 }
    );
  }

  //
  // 7. 최근 7일 거래내역조회
  //
  const transactionUrl = new URL(
    "/v2.0/account/transaction_list/fin_num",
    baseUrl
  );

  transactionUrl.searchParams.set(
    "bank_tran_id",
    makeBankTranId(useOrgCode)
  );

  transactionUrl.searchParams.set(
    "fintech_use_num",
    fintechUseNum
  );

  transactionUrl.searchParams.set(
    "inquiry_type",
    "A"
  );

  transactionUrl.searchParams.set(
    "inquiry_base",
    "D"
  );

  transactionUrl.searchParams.set(
    "from_date",
    getKstDateDaysAgo(7)
  );

  transactionUrl.searchParams.set(
    "from_time",
    "000000"
  );

  transactionUrl.searchParams.set(
    "to_date",
    now.date
  );

  transactionUrl.searchParams.set(
    "to_time",
    "235959"
  );

  transactionUrl.searchParams.set(
    "sort_order",
    "D"
  );

  transactionUrl.searchParams.set(
    "tran_dtime",
    now.datetime
  );

  const transactionResponse = await fetch(
    transactionUrl,
    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${accessToken}`,
      },

      cache: "no-store",
    }
  );

  let transactionData: any;

  try {
    transactionData =
      await transactionResponse.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        stage: "transactions",
        error:
          "거래내역 응답을 JSON으로 읽지 못했습니다.",
        httpStatus:
          transactionResponse.status,
      },
      { status: 400 }
    );
  }

  if (
    !transactionResponse.ok ||
    transactionData.rsp_code !== "A0000"
  ) {
    return NextResponse.json(
      {
        success: false,
        stage: "transactions",
        httpStatus:
          transactionResponse.status,

        kftc: {
          rspCode:
            transactionData.rsp_code,

          rspMessage:
            transactionData.rsp_message,

          bankRspCode:
            transactionData.bank_rsp_code,

          bankRspMessage:
            transactionData.bank_rsp_message,
        },

        //
        // 디버깅용이며 Token이나
        // fintech_use_num은 반환하지 않음
        //
        query: {
          fromDate:
            getKstDateDaysAgo(7),

          toDate: now.date,

          inquiryType: "A",
          inquiryBase: "D",
          sortOrder: "D",
        },
      },
      { status: 400 }
    );
  }

  //
  // 8. 거래내역 정리
  //
  const rawTransactions = Array.isArray(
    transactionData.res_list
  )
    ? transactionData.res_list
    : [];

  const transactions =
    rawTransactions.map((tx: any) => ({
      date: tx.tran_date,
      time: tx.tran_time,

      inoutType:
        tx.inout_type,

      transactionType:
        tx.tran_type,

      //
      // KFTC 문서 표에는 print_content,
      // 응답 예시에는 printed_content가
      // 등장하므로 둘 다 대응
      //
      printContent:
        tx.print_content ??
        tx.printed_content ??
        "",

      amount:
        tx.tran_amt,

      afterBalance:
        tx.after_balance_amt,

      branchName:
        tx.branch_name ?? "",
    }));

  //
  // 9. 검증용 최종 응답
  //
  const response =
    NextResponse.json({
      //
      // 새 코드가 실제 Vercel에
      // 반영됐는지 바로 식별하기 위한 값
      //
      version:
        "kftc-balance-transaction-test-v3",

      success: true,

      account: {
        bankName:
          firstAccount.bank_name,

        accountAlias:
          firstAccount.account_alias,

        accountMasked:
          firstAccount.account_num_masked,

        accountType:
          firstAccount.account_type,

        inquiryAgreeYn:
          firstAccount.inquiry_agree_yn,
      },

      balance: {
        rspCode:
          balanceData.rsp_code,

        rspMessage:
          balanceData.rsp_message,

        bankRspCode:
          balanceData.bank_rsp_code,

        bankRspMessage:
          balanceData.bank_rsp_message,

        balanceAmount:
          balanceData.balance_amt,

        availableAmount:
          balanceData.available_amt,

        accountType:
          balanceData.account_type,

        productName:
          balanceData.product_name,

        lastTransactionDate:
          balanceData.last_tran_date,
      },

      transactionQuery: {
        fromDate:
          getKstDateDaysAgo(7),

        toDate:
          now.date,

        rspCode:
          transactionData.rsp_code,

        rspMessage:
          transactionData.rsp_message,

        bankRspCode:
          transactionData.bank_rsp_code,

        bankRspMessage:
          transactionData.bank_rsp_message,

        recordCount:
          transactionData.page_record_cnt,

        nextPage:
          transactionData.next_page_yn,

        beforeInquiryTraceInfo:
          transactionData
            .befor_inquiry_trace_info ??
          null,
      },

      transactions,
    });

  //
  // 재사용 방지를 위해 state 쿠키 제거
  //
  response.cookies.delete(
    "kftc_oauth_state"
  );

  return response;
}