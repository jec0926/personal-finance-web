import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  NextRequest,
  NextResponse,
} from "next/server";

async function getCurrentAppUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return null;
  }

  const email = session.user.email
    .trim()
    .toLowerCase();

  const { data, error } =
    await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("email", email)
      .single();

  if (error || !data) {
    return null;
  }

  return data;
}

function normalizeText(
  value: string | null
) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getMonthRange(
  yearMonth: string
) {
  const [year, month] =
    yearMonth
      .split("-")
      .map(Number);

  const start =
    `${yearMonth}-01`;

  const nextDate =
    new Date(
      Date.UTC(
        year,
        month,
        1
      )
    );

  const end =
    nextDate
      .toISOString()
      .slice(0, 10);

  return {
    start,
    end,
  };
}

function sortPair(
  id1: string,
  id2: string
) {
  return id1 < id2
    ? [id1, id2]
    : [id2, id1];
}

/*
 * =========================================================
 * 중복 후보 조회
 * =========================================================
 */
export async function GET(
  request: NextRequest
) {
  const user =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: "로그인이 필요합니다.",
      },
      { status: 401 }
    );
  }

  const month =
    request.nextUrl.searchParams.get(
      "month"
    );

  let candidateQuery =
    supabaseAdmin
      .from(
        "transaction_duplicate_candidates"
      )
      .select(
        `
        id,
        transaction_a_id,
        transaction_b_id,
        reason,
        score,
        status,
        kept_transaction_id,
        duplicate_transaction_id,
        created_at,
        resolved_at
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  const {
    data: candidates,
    error: candidateError,
  } =
    await candidateQuery;

  if (candidateError) {
    return NextResponse.json(
      {
        success: false,
        error:
          candidateError.message,
      },
      { status: 500 }
    );
  }

  if (
    !candidates ||
    candidates.length === 0
  ) {
    return NextResponse.json({
      success: true,
      candidates: [],
    });
  }

  const transactionIds =
    Array.from(
      new Set(
        candidates.flatMap(
          (candidate) => [
            candidate.transaction_a_id,
            candidate.transaction_b_id,
          ]
        )
      )
    );

  let transactionQuery =
    supabaseAdmin
      .from("transactions")
      .select(
        `
        id,
        upload_batch_id,
        transaction_date,
        source_type,
        account_name,
        counterparty,
        description,
        transaction_type,
        category_l1,
        category_l2,
        amount,
        include_in_ledger,
        review_required,
        source_row
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .in(
        "id",
        transactionIds
      );

  if (
    month &&
    /^\d{4}-\d{2}$/.test(month)
  ) {
    const {
      start,
      end,
    } =
      getMonthRange(month);

    transactionQuery =
      transactionQuery
        .gte(
          "transaction_date",
          start
        )
        .lt(
          "transaction_date",
          end
        );
  }

  const {
    data: transactions,
    error: transactionError,
  } =
    await transactionQuery;

  if (transactionError) {
    return NextResponse.json(
      {
        success: false,
        error:
          transactionError.message,
      },
      { status: 500 }
    );
  }

  const transactionMap =
    new Map(
      (transactions ?? []).map(
        (transaction) => [
          transaction.id,
          transaction,
        ]
      )
    );

  const result =
    candidates
      .map(
        (candidate) => {
          const transactionA =
            transactionMap.get(
              candidate.transaction_a_id
            );

          const transactionB =
            transactionMap.get(
              candidate.transaction_b_id
            );

          if (
            !transactionA ||
            !transactionB
          ) {
            return null;
          }

          return {
            ...candidate,

            transactionA,
            transactionB,
          };
        }
      )
      .filter(Boolean);

  return NextResponse.json({
    success: true,

    candidates:
      result,
  });
}

/*
 * =========================================================
 * 중복 후보 Scan
 * =========================================================
 */
export async function POST(
  request: NextRequest
) {
  const user =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: "로그인이 필요합니다.",
      },
      { status: 401 }
    );
  }

  const body =
    await request.json();

  const month =
    String(
      body.month ?? ""
    );

  if (
    !/^\d{4}-\d{2}$/.test(
      month
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "중복 검토할 월을 선택해주세요.",
      },
      { status: 400 }
    );
  }

  const {
    start,
    end,
  } =
    getMonthRange(month);

  /*
   * 실제 원장에 포함된 거래만 Scan.
   */
  const {
    data: transactions,
    error,
  } =
    await supabaseAdmin
      .from("transactions")
      .select(
        `
        id,
        upload_batch_id,
        transaction_date,
        source_type,
        account_name,
        counterparty,
        description,
        amount
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "include_in_ledger",
        true
      )
      .gte(
        "transaction_date",
        start
      )
      .lt(
        "transaction_date",
        end
      )
      .order(
        "transaction_date",
        {
          ascending: true,
        }
      );

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  const rows =
    transactions ?? [];

  /*
   * source/date/amount가 같은 거래끼리
   * 먼저 그룹화.
   */
  const groups =
    new Map<
      string,
      typeof rows
    >();

  for (
    const transaction
    of rows
  ) {
    const amount =
      Number(
        transaction.amount
      );

    const key = [
      transaction.source_type,
      transaction.transaction_date,
      amount.toFixed(2),
    ].join("|");

    const group =
      groups.get(key) ??
      [];

    group.push(
      transaction
    );

    groups.set(
      key,
      group
    );
  }

  const candidatePayload:
    Array<{
      user_id: string;
      transaction_a_id: string;
      transaction_b_id: string;
      reason: string;
      score: number;
    }> = [];

  /*
   * 같은 날짜 + 금액 중에서도
   * 거래처/설명/계좌가 유사한 경우만
   * 후보로 생성.
   */
  for (
    const group
    of groups.values()
  ) {
    if (
      group.length < 2
    ) {
      continue;
    }

    for (
      let i = 0;
      i < group.length;
      i += 1
    ) {
      for (
        let j = i + 1;
        j < group.length;
        j += 1
      ) {
        const left =
          group[i];

        const right =
          group[j];

        /*
         * 동일 업로드 Batch 내부의
         * 같은 금액 결제는 실제 복수거래일
         * 가능성이 높으므로 우선 제외.
         *
         * 이 기능은 주로 기간이 겹치는
         * 서로 다른 파일 업로드를 검토한다.
         */
        if (
          left.upload_batch_id &&
          right.upload_batch_id &&
          left.upload_batch_id ===
            right.upload_batch_id
        ) {
          continue;
        }

        const leftCounterparty =
          normalizeText(
            left.counterparty
          );

        const rightCounterparty =
          normalizeText(
            right.counterparty
          );

        const leftDescription =
          normalizeText(
            left.description
          );

        const rightDescription =
          normalizeText(
            right.description
          );

        const leftAccount =
          normalizeText(
            left.account_name
          );

        const rightAccount =
          normalizeText(
            right.account_name
          );

        let score = 50;

        const reasons: string[] =
          [
            "거래일과 금액 동일",
          ];

        if (
          leftCounterparty &&
          rightCounterparty &&
          leftCounterparty ===
            rightCounterparty
        ) {
          score += 30;

          reasons.push(
            "거래처 동일"
          );
        }

        if (
          leftDescription &&
          rightDescription &&
          leftDescription ===
            rightDescription
        ) {
          score += 15;

          reasons.push(
            "거래내용 동일"
          );
        }

        if (
          leftAccount &&
          rightAccount &&
          leftAccount ===
            rightAccount
        ) {
          score += 5;

          reasons.push(
            "계좌/카드 동일"
          );
        }

        /*
         * 날짜와 금액만 같은 경우까지
         * 모두 후보로 만들면
         * 카드 동일금액 반복 결제가 너무
         * 많이 잡힐 수 있으므로,
         *
         * 거래처 또는 거래내용이
         * 하나 이상 일치해야 후보 생성.
         */
        const meaningfulMatch =
          (
            leftCounterparty &&
            rightCounterparty &&
            leftCounterparty ===
              rightCounterparty
          ) ||
          (
            leftDescription &&
            rightDescription &&
            leftDescription ===
              rightDescription
          );

        if (!meaningfulMatch) {
          continue;
        }

        const [
          transactionAId,
          transactionBId,
        ] =
          sortPair(
            left.id,
            right.id
          );

        candidatePayload.push({
          user_id:
            user.id,

          transaction_a_id:
            transactionAId,

          transaction_b_id:
            transactionBId,

          reason:
            reasons.join(" · "),

          score,
        });
      }
    }
  }

  if (
    candidatePayload.length ===
    0
  ) {
    return NextResponse.json({
      success: true,

      scannedCount:
        rows.length,

      detectedCount: 0,

      insertedCount: 0,
    });
  }

  /*
   * 기존 검토 결과를 덮어쓰지 않는다.
   */
  const {
    data: inserted,
    error:
      insertError,
  } =
    await supabaseAdmin
      .from(
        "transaction_duplicate_candidates"
      )
      .upsert(
        candidatePayload,
        {
          onConflict:
            "user_id,transaction_a_id,transaction_b_id",

          ignoreDuplicates:
            true,
        }
      )
      .select("id");

  if (insertError) {
    return NextResponse.json(
      {
        success: false,
        error:
          insertError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,

    scannedCount:
      rows.length,

    detectedCount:
      candidatePayload.length,

    insertedCount:
      inserted?.length ?? 0,
  });
}