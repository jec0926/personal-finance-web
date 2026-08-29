import { auth } from "@/auth";

import {
  supabaseAdmin,
} from "@/lib/supabase/admin";

import {
  applyClassificationRules,
  StoredClassificationRule,
} from "@/lib/finance/classification-rules";

import {
  buildTransactionId,
  getTransactionIdentityBase,
  sha256Buffer,
} from "@/lib/finance/transaction-id";

import {
  SourceType,
} from "@/lib/finance/types";

import {
  parseFinancialWorkbook,
} from "@/lib/finance/xls-parser";

import {
  NextRequest,
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

/*
 * =========================================================
 * 로그인 사용자 조회
 * =========================================================
 */

async function getCurrentAppUser() {
  const session =
    await auth();

  if (
    !session?.user?.email
  ) {
    return null;
  }

  const email =
    session.user.email
      .trim()
      .toLowerCase();

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("app_users")
      .select(
        "id, email"
      )
      .eq(
        "email",
        email
      )
      .single();

  if (
    error ||
    !data
  ) {
    return null;
  }

  return data;
}

/*
 * =========================================================
 * 사용자 FUTURE 분류규칙 조회
 * =========================================================
 */

async function loadClassificationRules(
  userId: string,
  sourceType: SourceType
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "classification_rules"
      )
      .select(
        `
        id,
        source_type,
        match_field,
        match_operator,
        match_value,
        match_value_normalized,
        transaction_type,
        category_l1,
        category_l2,
        fixed_variable,
        essential_optional,
        priority,
        is_active
        `
      )
      .eq(
        "user_id",
        userId
      )
      .eq(
        "source_type",
        sourceType
      )
      .eq(
        "is_active",
        true
      )
      .order(
        "priority",
        {
          ascending: true,
        }
      );

  if (error) {
    throw new Error(
      `사용자 분류규칙 조회 실패: ${error.message}`
    );
  }

  return (
    data ??
    []
  ) as StoredClassificationRule[];
}

/*
 * =========================================================
 * 최근 업로드 이력
 * =========================================================
 */

export async function GET() {
  const user =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,

        error:
          "로그인이 필요합니다.",
      },
      {
        status: 401,
      }
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "upload_batches"
      )
      .select(
        `
        id,
        source_type,
        original_filename,
        status,
        parsed_count,
        inserted_count,
        duplicate_count,
        error_message,
        created_at,
        completed_at
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
      )
      .limit(20);

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    success: true,

    batches:
      data ?? [],
  });
}

/*
 * =========================================================
 * 파일 업로드
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

        error:
          "로그인이 필요합니다.",
      },
      {
        status: 401,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * FormData
   * ---------------------------------------------------------
   */

  const formData =
    await request.formData();

  const file =
    formData.get(
      "file"
    );

  const sourceTypeValue =
    String(
      formData.get(
        "sourceType"
      ) ?? ""
    );

  const accountName =
    String(
      formData.get(
        "accountName"
      ) ?? ""
    ).trim();

  if (
    !(file instanceof File)
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          "업로드할 파일이 없습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    sourceTypeValue !==
      "BANK" &&
    sourceTypeValue !==
      "CARD"
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          "은행 또는 카드 구분을 선택해주세요.",
      },
      {
        status: 400,
      }
    );
  }

  const sourceType =
    sourceTypeValue as SourceType;

  /*
   * ---------------------------------------------------------
   * 확장자 확인
   * ---------------------------------------------------------
   */

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  if (
    extension !== "xls" &&
    extension !== "xlsx"
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          "XLS 또는 XLSX 파일만 업로드할 수 있습니다.",
      },
      {
        status: 400,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 파일 Buffer
   * ---------------------------------------------------------
   */

  const arrayBuffer =
    await file.arrayBuffer();

  const buffer =
    Buffer.from(
      arrayBuffer
    );

  /*
   * 같은 파일을 BANK와 CARD로 각각
   * 등록했을 때 서로 다른 fingerprint가
   * 되도록 sourceType 포함.
   */
  const rawHash =
    sha256Buffer(
      buffer
    );

  const sourceFingerprint =
    sha256Buffer(
      Buffer.from(
        `${sourceType}:${rawHash}`
      )
    );

  /*
   * =========================================================
   * 기존 Batch 확인
   * =========================================================
   */

  const {
    data:
      existingBatch,
    error:
      existingBatchError,
  } =
    await supabaseAdmin
      .from(
        "upload_batches"
      )
      .select(
        `
        id,
        original_filename,
        status,
        parsed_count,
        inserted_count,
        duplicate_count,
        created_at
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "source_fingerprint",
        sourceFingerprint
      )
      .maybeSingle();

  if (
    existingBatchError
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          existingBatchError.message,
      },
      {
        status: 500,
      }
    );
  }

  let batch:
    | {
        id: string;
      }
    | null = null;

  /*
   * ---------------------------------------------------------
   * COMPLETED
   * ---------------------------------------------------------
   */

  if (
    existingBatch?.status ===
    "COMPLETED"
  ) {
    return NextResponse.json(
      {
        success: false,

        duplicateFile: true,

        error:
          "이미 정상 처리된 파일입니다.",

        batch:
          existingBatch,
      },
      {
        status: 409,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * PROCESSING
   * ---------------------------------------------------------
   */

  if (
    existingBatch?.status ===
    "PROCESSING"
  ) {
    return NextResponse.json(
      {
        success: false,

        duplicateFile: true,

        error:
          "현재 처리 중인 파일입니다.",

        batch:
          existingBatch,
      },
      {
        status: 409,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * FAILED 재시도
   * ---------------------------------------------------------
   */

  if (
    existingBatch?.status ===
    "FAILED"
  ) {
    /*
     * 이전 실패 과정에서 일부 transaction이
     * 들어갔을 가능성까지 고려해 정리.
     */
    const {
      error:
        cleanupError,
    } =
      await supabaseAdmin
        .from(
          "transactions"
        )
        .delete()
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "upload_batch_id",
          existingBatch.id
        );

    if (cleanupError) {
      return NextResponse.json(
        {
          success: false,

          error:
            `실패 Batch 초기화 중 오류가 발생했습니다: ${cleanupError.message}`,
        },
        {
          status: 500,
        }
      );
    }

    const {
      data:
        retryBatch,
      error:
        retryBatchError,
    } =
      await supabaseAdmin
        .from(
          "upload_batches"
        )
        .update({
          original_filename:
            file.name,

          source_type:
            sourceType,

          status:
            "PROCESSING",

          parsed_count:
            0,

          inserted_count:
            0,

          duplicate_count:
            0,

          error_message:
            null,

          completed_at:
            null,
        })
        .eq(
          "id",
          existingBatch.id
        )
        .eq(
          "user_id",
          user.id
        )
        .select(
          "id"
        )
        .single();

    if (
      retryBatchError ||
      !retryBatch
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            retryBatchError?.message ??
            "실패한 업로드를 재시작하지 못했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    batch =
      retryBatch;
  }

  /*
   * ---------------------------------------------------------
   * 신규 Batch
   * ---------------------------------------------------------
   */

  if (!existingBatch) {
    const {
      data:
        newBatch,
      error:
        batchError,
    } =
      await supabaseAdmin
        .from(
          "upload_batches"
        )
        .insert({
          user_id:
            user.id,

          source_type:
            sourceType,

          original_filename:
            file.name,

          source_fingerprint:
            sourceFingerprint,

          status:
            "PROCESSING",
        })
        .select(
          "id"
        )
        .single();

    if (
      batchError ||
      !newBatch
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            batchError?.message ??
            "업로드 Batch 생성에 실패했습니다.",
        },
        {
          status: 500,
        }
      );
    }

    batch =
      newBatch;
  }

  if (!batch) {
    return NextResponse.json(
      {
        success: false,

        error:
          "업로드 Batch를 준비하지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }

  /*
   * =========================================================
   * 실제 처리
   * =========================================================
   */

  try {
    /*
     * ---------------------------------------------------------
     * 1. XLS Parser
     *
     * 여기까지는 기존 system classifier의
     * 기본 결과가 들어있다.
     * ---------------------------------------------------------
     */

    const parsed =
      parseFinancialWorkbook(
        buffer,
        {
          sourceType,

          defaultAccountName:
            accountName ||
            undefined,

          originalFilename:
            file.name,
        }
      );

    if (
      parsed.length ===
      0
    ) {
      throw new Error(
        "거래내역을 찾지 못했습니다."
      );
    }

    /*
     * ---------------------------------------------------------
     * 2. 사용자 FUTURE 규칙 로딩
     *
     * 파일별로 한 번만 DB 조회.
     * 거래 한 건마다 조회하지 않는다.
     * ---------------------------------------------------------
     */

    const userRules =
      await loadClassificationRules(
        user.id,
        sourceType
      );

    /*
     * ---------------------------------------------------------
     * 3. 사용자 규칙 적용
     *
     * parser 기본분류 결과 위에
     * FUTURE 규칙을 덮어쓴다.
     * ---------------------------------------------------------
     */

    let ruleMatchedCount =
      0;

    const ruleMatchCountById =
      new Map<
        string,
        number
      >();

    const classified =
      parsed.map(
        (
          transaction
        ) => {
          const result =
            applyClassificationRules(
              transaction,
              userRules
            );

          if (
            result.matchedRule
          ) {
            ruleMatchedCount +=
              1;

            const ruleId =
              result
                .matchedRule
                .id;

            ruleMatchCountById.set(
              ruleId,
              (
                ruleMatchCountById.get(
                  ruleId
                ) ?? 0
              ) + 1
            );
          }

          return result
            .transaction;
        }
      );

    /*
     * ---------------------------------------------------------
     * 4. transaction_id 생성
     * ---------------------------------------------------------
     */

    const occurrenceMap =
      new Map<
        string,
        number
      >();

    const payload =
      classified.map(
        (
          transaction
        ) => {
          const identity =
            getTransactionIdentityBase(
              transaction
            );

          const nextOccurrence =
            (
              occurrenceMap.get(
                identity
              ) ?? 0
            ) + 1;

          occurrenceMap.set(
            identity,
            nextOccurrence
          );

          const transactionId =
            buildTransactionId(
              transaction,
              nextOccurrence
            );

          return {
            user_id:
              user.id,

            upload_batch_id:
              batch.id,

            transaction_id:
              transactionId,

            transaction_date:
              transaction.transactionDate,

            source_type:
              transaction.sourceType,

            account_name:
              transaction.accountName,

            counterparty:
              transaction.counterparty,

            description:
              transaction.description,

            transaction_type:
              transaction.transactionType,

            category_l1:
              transaction.categoryL1,

            category_l2:
              transaction.categoryL2,

            fixed_variable:
              transaction.fixedVariable,

            essential_optional:
              transaction.essentialOptional,

            amount:
              transaction.amount,

            gross_amount:
              transaction.grossAmount,

            benefit_amount:
              transaction.benefitAmount,

            fee_amount:
              transaction.feeAmount,

            net_amount:
              transaction.netAmount,

            original_amount:
              transaction.originalAmount,

            original_currency:
              transaction.originalCurrency,

            exchange_rate:
              transaction.exchangeRate,

            include_in_ledger:
              true,

            review_required:
              transaction.reviewRequired,

            source_row:
              transaction.sourceRow,

            raw_data:
              transaction.rawData,
          };
        }
      );

    /*
     * ---------------------------------------------------------
     * 5. DB 저장
     * ---------------------------------------------------------
     */

    const CHUNK_SIZE =
      500;

    let insertedCount =
      0;

    for (
      let start = 0;
      start <
      payload.length;
      start +=
      CHUNK_SIZE
    ) {
      const chunk =
        payload.slice(
          start,
          start +
            CHUNK_SIZE
        );

      const {
        data:
          insertedRows,
        error:
          insertError,
      } =
        await supabaseAdmin
          .from(
            "transactions"
          )
          .upsert(
            chunk,
            {
              onConflict:
                "user_id,transaction_id",

              ignoreDuplicates:
                true,
            }
          )
          .select(
            "id"
          );

      if (
        insertError
      ) {
        throw new Error(
          insertError.message
        );
      }

      insertedCount +=
        insertedRows?.length ??
        0;
    }

    const duplicateCount =
      parsed.length -
      insertedCount;

    /*
     * ---------------------------------------------------------
     * 6. Batch 완료
     * ---------------------------------------------------------
     */

    const {
      error:
        completeError,
    } =
      await supabaseAdmin
        .from(
          "upload_batches"
        )
        .update({
          status:
            "COMPLETED",

          parsed_count:
            parsed.length,

          inserted_count:
            insertedCount,

          duplicate_count:
            duplicateCount,

          error_message:
            null,

          completed_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          batch.id
        );

    if (
      completeError
    ) {
      throw new Error(
        completeError.message
      );
    }

    /*
     * ---------------------------------------------------------
     * 7. 결과 반환
     * ---------------------------------------------------------
     */

    return NextResponse.json({
      success: true,

      batchId:
        batch.id,

      filename:
        file.name,

      sourceType,

      parsedCount:
        parsed.length,

      insertedCount,

      duplicateCount,

      /*
       * 이번 업로드에서
       * FUTURE 규칙으로 자동분류된 건수
       */
      ruleMatchedCount,

      /*
       * 디버깅/테스트용
       *
       * 어떤 규칙이 몇 건 적용됐는지.
       */
      appliedRules:
        Array.from(
          ruleMatchCountById.entries()
        ).map(
          ([
            ruleId,
            count,
          ]) => ({
            ruleId,
            count,
          })
        ),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "파일 처리 중 오류가 발생했습니다.";

    /*
     * ---------------------------------------------------------
     * 실패 Batch 처리
     * ---------------------------------------------------------
     */

    await supabaseAdmin
      .from(
        "upload_batches"
      )
      .update({
        status:
          "FAILED",

        error_message:
          message,

        completed_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        batch.id
      );

    return NextResponse.json(
      {
        success: false,
        error:
          message,
      },
      {
        status: 500,
      }
    );
  }
}