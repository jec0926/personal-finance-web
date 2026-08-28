import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function getKstDateTime() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const iso = now.toISOString();

  return {
    date: iso.slice(0, 10).replaceAll("-", ""),
    time: iso.slice(11, 19).replaceAll(":", ""),
    datetime:
      iso.slice(0, 10).replaceAll("-", "") +
      iso.slice(11, 19).replaceAll(":", ""),
  };
}

function getKstDateDaysAgo(days: number) {
  const date = new Date(
    Date.now() + 9 * 60 * 60 * 1000 - days * 24 * 60 * 60 * 1000
  );

  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function makeBankTranId(useOrgCode: string) {
  const randomPart = crypto
    .randomInt(0, 1_000_000_000)
    .toString()
    .padStart(9, "0");

  return `${useOrgCode}U${randomPart}`;
}




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
const useOrgCode = process.env.KFTC_USE_ORG_CODE?.trim();

if (!useOrgCode || useOrgCode.length !== 10) {
  return NextResponse.json(
    {
      success: false,
      stage: "kftc_config",
      error: "KFTC_USE_ORG_CODE가 없거나 10자리가 아닙니다.",
    },
    { status: 500 }
  );
}

  const firstAccount = meData.res_list?.[0];

  if (!firstAccount?.fintech_use_num) {
    return NextResponse.json(
      {
        success: false,
        stage: "account",
        error: "조회 가능한 fintech_use_num이 없습니다.",
      },
      { status: 400 }
    );
  }

  const fintechUseNum = firstAccount.fintech_use_num;
  const now = getKstDateTime();

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

  const balanceResponse = await fetch(balanceUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const balanceData = await balanceResponse.json();

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
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  const transactionData =
    await transactionResponse.json();

  //
  // Token 원문은 절대로 브라우저에 반환하지 않음
  //
  const transactions = Array.isArray(
  transactionData.res_list
)
  ? transactionData.res_list.map((tx: any) => ({
      date: tx.tran_date,
      time: tx.tran_time,
      inoutType: tx.inout_type,
      transactionType: tx.tran_type,

      printContent:
        tx.print_content ??
        tx.printed_content ??
        "",

      amount: tx.tran_amt,
      afterBalance: tx.after_balance_amt,
      branchName: tx.branch_name,
    }))
  : [];

const response = NextResponse.json({
  success: true,

  account: {
    bankName: firstAccount.bank_name,
    accountAlias: firstAccount.account_alias,
    accountMasked:
      firstAccount.account_num_masked,
  },

  balance: {
    rspCode: balanceData.rsp_code,
    rspMessage: balanceData.rsp_message,
    bankRspCode: balanceData.bank_rsp_code,
    bankRspMessage:
      balanceData.bank_rsp_message,

    balanceAmount: balanceData.balance_amt,
    availableAmount:
      balanceData.available_amt,

    productName: balanceData.product_name,
    lastTransactionDate:
      balanceData.last_tran_date,
  },

  transactionQuery: {
    rspCode: transactionData.rsp_code,
    rspMessage: transactionData.rsp_message,
    bankRspCode:
      transactionData.bank_rsp_code,
    bankRspMessage:
      transactionData.bank_rsp_message,

    recordCount:
      transactionData.page_record_cnt,

    nextPage:
      transactionData.next_page_yn,
  },

  transactions,
});

response.cookies.delete("kftc_oauth_state");

return response;