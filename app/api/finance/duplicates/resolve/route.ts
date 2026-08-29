import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  NextRequest,
  NextResponse,
} from "next/server";

async function getCurrentAppUser() {
  const session =
    await auth();

  if (!session?.user?.email) {
    return null;
  }

  const email =
    session.user.email
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

export async function POST(
  request: NextRequest
) {
  const user =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error:
          "로그인이 필요합니다.",
      },
      { status: 401 }
    );
  }

  const body =
    await request.json();

  const candidateId =
    String(
      body.candidateId ??
      ""
    );

  const action =
    String(
      body.action ??
      ""
    );

  if (!candidateId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "중복 후보 ID가 없습니다.",
      },
      { status: 400 }
    );
  }

  if (
    ![
      "NOT_DUPLICATE",
      "KEEP_A",
      "KEEP_B",
    ].includes(action)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "잘못된 중복 처리 방식입니다.",
      },
      { status: 400 }
    );
  }

  const {
    data: candidate,
    error:
      candidateError,
  } =
    await supabaseAdmin
      .from(
        "transaction_duplicate_candidates"
      )
      .select(
        `
        id,
        transaction_a_id,
        transaction_b_id,
        status
        `
      )
      .eq(
        "id",
        candidateId
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (
    candidateError ||
    !candidate
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          candidateError?.message ??
          "중복 후보를 찾을 수 없습니다.",
      },
      {
        status:
          candidateError
            ? 500
            : 404,
      }
    );
  }

  /*
   * 둘 다 정상 거래
   */
  if (
    action ===
    "NOT_DUPLICATE"
  ) {
    const {
      error,
    } =
      await supabaseAdmin
        .from(
          "transaction_duplicate_candidates"
        )
        .update({
          status:
            "NOT_DUPLICATE",

          kept_transaction_id:
            null,

          duplicate_transaction_id:
            null,

          resolved_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          candidate.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,

      status:
        "NOT_DUPLICATE",
    });
  }

  /*
   * 한쪽을 중복으로 확정
   */
  const keptTransactionId =
    action === "KEEP_A"
      ? candidate.transaction_a_id
      : candidate.transaction_b_id;

  const duplicateTransactionId =
    action === "KEEP_A"
      ? candidate.transaction_b_id
      : candidate.transaction_a_id;

  /*
   * 두 거래가 현재 사용자 거래인지 확인.
   */
  const {
    data: transactions,
    error:
      transactionError,
  } =
    await supabaseAdmin
      .from("transactions")
      .select("id")
      .eq(
        "user_id",
        user.id
      )
      .in(
        "id",
        [
          keptTransactionId,
          duplicateTransactionId,
        ]
      );

  if (
    transactionError ||
    !transactions ||
    transactions.length !== 2
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          transactionError?.message ??
          "중복 처리할 거래를 확인할 수 없습니다.",
      },
      { status: 500 }
    );
  }

  /*
   * 유지 거래는 원장 포함.
   */
  const {
    error: keepError,
  } =
    await supabaseAdmin
      .from("transactions")
      .update({
        include_in_ledger:
          true,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        keptTransactionId
      )
      .eq(
        "user_id",
        user.id
      );

  if (keepError) {
    return NextResponse.json(
      {
        success: false,
        error:
          keepError.message,
      },
      { status: 500 }
    );
  }

  /*
   * 중복 거래는 삭제하지 않고
   * 원장에서 제외.
   */
  const {
    error: duplicateError,
  } =
    await supabaseAdmin
      .from("transactions")
      .update({
        include_in_ledger:
          false,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        duplicateTransactionId
      )
      .eq(
        "user_id",
        user.id
      );

  if (duplicateError) {
    return NextResponse.json(
      {
        success: false,
        error:
          duplicateError.message,
      },
      { status: 500 }
    );
  }

  const {
    error:
      resolveError,
  } =
    await supabaseAdmin
      .from(
        "transaction_duplicate_candidates"
      )
      .update({
        status:
          "DUPLICATE",

        kept_transaction_id:
          keptTransactionId,

        duplicate_transaction_id:
          duplicateTransactionId,

        resolved_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        candidate.id
      )
      .eq(
        "user_id",
        user.id
      );

  if (resolveError) {
    return NextResponse.json(
      {
        success: false,
        error:
          resolveError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,

    status:
      "DUPLICATE",

    keptTransactionId,

    duplicateTransactionId,
  });
}