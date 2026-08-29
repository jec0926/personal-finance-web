import * as XLSX from "xlsx";

import {
  classifyTransaction,
} from "./classifier";

import {
  ParsedTransaction,
  SourceType,
} from "./types";

type ParseOptions = {
  sourceType: SourceType;

  defaultAccountName?: string;

  /*
   * 카드 파일은 이용일자가
   * 06.12처럼 연도 없이 들어오기 때문에
   * 원본 파일명에서 연도를 추출하기 위해 사용
   */
  originalFilename?: string;
};

/*
 * =========================================================
 * 공통 Utility
 * =========================================================
 */

function normalizeHeader(
  value: unknown
) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase()
    /*
     * 줄바꿈, 괄호, 공백 등 제거.
     *
     * 예:
     * "이용\n일자"
     * → "이용일자"
     *
     * "이용가맹점(은행)명"
     * → "이용가맹점은행명"
     */
    .replace(
      /[^0-9a-zA-Z가-힣]/g,
      ""
    );
}

function normalizeText(
  value: unknown
) {
  const text =
    String(
      value ?? ""
    ).trim();

  return text || null;
}

function parseMoney(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : null;
  }

  let text =
    String(value)
      .trim();

  if (!text) {
    return null;
  }

  const negativeByParentheses =
    text.startsWith("(") &&
    text.endsWith(")");

  /*
   * 해외 결제 원금 예:
   *
   * 16,802 \n USD10.75
   *
   * Number()에 바로 넣을 수 없으므로
   * 첫 번째 숫자만 추출한다.
   */
  const numberMatch =
    text.match(
      /-?[\d,]+(?:\.\d+)?/
    );

  if (!numberMatch) {
    return null;
  }

  const cleaned =
    numberMatch[0]
      .replace(
        /,/g,
        ""
      );

  const parsed =
    Number(cleaned);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return null;
  }

  return negativeByParentheses
    ? -Math.abs(parsed)
    : parsed;
}

function pad2(
  value: number
) {
  return String(
    value
  ).padStart(
    2,
    "0"
  );
}

/*
 * =========================================================
 * 헤더 탐색
 * =========================================================
 */

function rowContainsKeyword(
  row: unknown[],
  keyword: string
) {
  const normalizedKeyword =
    normalizeHeader(
      keyword
    );

  return row.some(
    (cell) => {
      const normalizedCell =
        normalizeHeader(
          cell
        );

      return (
        normalizedCell ===
          normalizedKeyword ||
        normalizedCell.includes(
          normalizedKeyword
        )
      );
    }
  );
}

function findRowWithKeywords(
  rows: unknown[][],
  keywords: string[]
) {
  /*
   * 금융기관 파일의 제목/안내 영역은
   * 대체로 20행 안쪽에 있으므로
   * 앞 30행을 확인한다.
   */
  const limit =
    Math.min(
      rows.length,
      30
    );

  for (
    let rowIndex = 0;
    rowIndex < limit;
    rowIndex += 1
  ) {
    const row =
      rows[rowIndex] ??
      [];

    const matched =
      keywords.every(
        (keyword) =>
          rowContainsKeyword(
            row,
            keyword
          )
      );

    if (matched) {
      return rowIndex;
    }
  }

  return -1;
}

function findColumn(
  row: unknown[],
  keywords: string[]
) {
  for (
    let columnIndex = 0;
    columnIndex <
    row.length;
    columnIndex += 1
  ) {
    const normalizedCell =
      normalizeHeader(
        row[columnIndex]
      );

    for (
      const keyword
      of keywords
    ) {
      const normalizedKeyword =
        normalizeHeader(
          keyword
        );

      if (
        normalizedCell ===
          normalizedKeyword ||
        normalizedCell.includes(
          normalizedKeyword
        )
      ) {
        return columnIndex;
      }
    }
  }

  return -1;
}

function getCell(
  row: unknown[],
  index: number
) {
  if (index < 0) {
    return undefined;
  }

  return row[index];
}

/*
 * =========================================================
 * Raw Data
 * =========================================================
 */

function createRawData(
  headers: string[],
  row: unknown[]
) {
  const result: Record<
    string,
    unknown
  > = {};

  headers.forEach(
    (
      header,
      index
    ) => {
      const key =
        header ||
        `COLUMN_${
          index + 1
        }`;

      result[key] =
        row[index] ??
        null;
    }
  );

  return result;
}

/*
 * =========================================================
 * 날짜 처리
 * =========================================================
 */

function parseBankDate(
  value: unknown
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value)
      .trim();

  /*
   * 실제 은행 파일:
   *
   * 2026.08.17 11:07
   */
  const match =
    text.match(
      /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/
    );

  if (!match) {
    return null;
  }

  return [
    match[1],
    pad2(
      Number(
        match[2]
      )
    ),
    pad2(
      Number(
        match[3]
      )
    ),
  ].join("-");
}

function inferCardYear(
  filename:
    | string
    | undefined
) {
  if (filename) {
    /*
     * 예:
     * report - 26년 7월 결제분(카드).xls
     */
    const koreanYear =
      filename.match(
        /(\d{2})\s*년/
      );

    if (koreanYear) {
      return (
        2000 +
        Number(
          koreanYear[1]
        )
      );
    }

    /*
     * 예:
     * card_2026_07.xls
     */
    const fullYear =
      filename.match(
        /(20\d{2})/
      );

    if (fullYear) {
      return Number(
        fullYear[1]
      );
    }
  }

  /*
   * 파일명에 연도가 없는 경우의
   * 임시 fallback.
   *
   * 추후 업로드 UI에
   * '카드 기준연도' 필드를 추가하면
   * 이 fallback을 제거할 수 있다.
   */
  return new Date()
    .getFullYear();
}

function parseCardDate(
  value: unknown,
  year: number
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value)
      .trim();

  /*
   * 실제 카드 파일:
   *
   * 06.12
   * 06.17
   * 07.01
   */
  const match =
    text.match(
      /^(\d{1,2})[.\-/](\d{1,2})$/
    );

  if (!match) {
    return null;
  }

  return [
    year,
    pad2(
      Number(
        match[1]
      )
    ),
    pad2(
      Number(
        match[2]
      )
    ),
  ].join("-");
}

/*
 * =========================================================
 * 카드 해외통화 처리
 * =========================================================
 */

function extractCurrency(
  value: unknown
) {
  const text =
    String(
      value ?? ""
    );

  /*
   * 실제 해외거래 원금 셀:
   *
   * 16,802 \n USD10.75
   */
  const match =
    text.match(
      /\b([A-Z]{3})\s*[\d,.]+/
    );

  return (
    match?.[1] ??
    null
  );
}

function isForeignCardTransaction(
  saleType:
    | string
    | null,
  principalText:
    | string
    | null
) {
  const combined =
    [
      saleType,
      principalText,
    ]
      .filter(
        Boolean
      )
      .join(" ")
      .toUpperCase();

  return (
    combined.includes(
      "국외"
    ) ||
    /\b[A-Z]{3}\s*[\d,.]+/.test(
      combined
    )
  );
}

/*
 * =========================================================
 * 은행 Adapter
 * =========================================================
 */

function parseBankWorkbook(
  rows: unknown[][],
  options: ParseOptions
): ParsedTransaction[] {
  /*
   * 실제 은행 XLS의 헤더:
   *
   * No.
   * 거래일시
   * 적요
   * 기재내용
   * 찾으신금액
   * 맡기신금액
   * 거래후 잔액
   * 취급기관
   * 메모
   */

  const headerRowIndex =
    findRowWithKeywords(
      rows,
      [
        "거래일시",
        "찾으신금액",
        "맡기신금액",
      ]
    );

  if (
    headerRowIndex < 0
  ) {
    throw new Error(
      "은행 XLS 헤더를 찾지 못했습니다. '거래일시 / 찾으신금액 / 맡기신금액' 열을 확인해주세요."
    );
  }

  const headers =
    rows[
      headerRowIndex
    ] ?? [];

  const dateIndex =
    findColumn(
      headers,
      [
        "거래일시",
      ]
    );

  const summaryIndex =
    findColumn(
      headers,
      [
        "적요",
      ]
    );

  const counterpartyIndex =
    findColumn(
      headers,
      [
        "기재내용",
      ]
    );

  const withdrawalIndex =
    findColumn(
      headers,
      [
        "찾으신금액",
      ]
    );

  const depositIndex =
    findColumn(
      headers,
      [
        "맡기신금액",
      ]
    );

  const balanceIndex =
    findColumn(
      headers,
      [
        "거래후잔액",
        "거래후 잔액",
      ]
    );

  const institutionIndex =
    findColumn(
      headers,
      [
        "취급기관",
      ]
    );

  const memoIndex =
    findColumn(
      headers,
      [
        "메모",
      ]
    );

  if (
    dateIndex < 0 ||
    withdrawalIndex < 0 ||
    depositIndex < 0
  ) {
    throw new Error(
      "은행 XLS의 필수 열을 확인할 수 없습니다."
    );
  }

  const rawHeaders =
    headers.map(
      (
        value,
        index
      ) =>
        String(
          value ?? ""
        ).trim() ||
        `COLUMN_${
          index + 1
        }`
    );

  const transactions:
    ParsedTransaction[] = [];

  for (
    let rowIndex =
      headerRowIndex + 1;
    rowIndex <
    rows.length;
    rowIndex += 1
  ) {
    const row =
      rows[
        rowIndex
      ] ?? [];

    const transactionDate =
      parseBankDate(
        getCell(
          row,
          dateIndex
        )
      );

    /*
     * 날짜가 없으면 합계/빈 행으로 판단
     */
    if (
      !transactionDate
    ) {
      continue;
    }

    const withdrawal =
      parseMoney(
        getCell(
          row,
          withdrawalIndex
        )
      ) ?? 0;

    const deposit =
      parseMoney(
        getCell(
          row,
          depositIndex
        )
      ) ?? 0;

    let amount = 0;

    if (
      withdrawal !== 0
    ) {
      amount =
        -Math.abs(
          withdrawal
        );
    } else if (
      deposit !== 0
    ) {
      amount =
        Math.abs(
          deposit
        );
    } else {
      /*
       * 금액 없는 행은 거래가 아님
       */
      continue;
    }

    /*
     * 실제 파일에서 사람/거래처 정보는
     * '기재내용'에 들어있다.
     *
     * 예:
     * 토스 허영진
     * 한국장학재단
     * 카카오페이
     */
    const counterparty =
      normalizeText(
        getCell(
          row,
          counterpartyIndex
        )
      );

    const summary =
      normalizeText(
        getCell(
          row,
          summaryIndex
        )
      );

    const institution =
      normalizeText(
        getCell(
          row,
          institutionIndex
        )
      );

    const memo =
      normalizeText(
        getCell(
          row,
          memoIndex
        )
      );

    /*
     * classifier에서 사용할 설명에는
     * 적요 + 취급기관 + 메모를 함께 제공.
     */
    const description =
      [
        summary,
        institution,
        memo,
      ]
        .filter(Boolean)
        .join(" | ") ||
      null;

    const classification =
      classifyTransaction({
        sourceType:
          "BANK",

        amount,

        counterparty,
        description,

        transactionDate,
      });

    transactions.push({
      transactionDate,

      sourceType:
        "BANK",

      accountName:
        options.defaultAccountName ??
        null,

      counterparty,
      description,

      transactionType:
        classification.transactionType,

      categoryL1:
        classification.categoryL1,

      categoryL2:
        classification.categoryL2,

      fixedVariable:
        classification.fixedVariable,

      essentialOptional:
        classification.essentialOptional,

      amount,

      /*
       * 은행은 카드 소비 원가 개념이 아니므로
       * gross / benefit / fee는 비워둔다.
       */
      grossAmount:
        null,

      benefitAmount:
        null,

      feeAmount:
        null,

      /*
       * 현금흐름 금액의 절댓값
       */
      netAmount:
        Math.abs(
          amount
        ),

      originalAmount:
        null,

      originalCurrency:
        null,

      exchangeRate:
        null,

      reviewRequired:
        classification.reviewRequired,

      /*
       * Excel 실제 행 번호
       */
      sourceRow:
        rowIndex + 1,

      rawData: {
        ...createRawData(
          rawHeaders,
          row
        ),

        __balance:
          balanceIndex >=
          0
            ? getCell(
                row,
                balanceIndex
              )
            : null,
      },
    });
  }

  return transactions;
}

/*
 * =========================================================
 * 카드 Adapter
 * =========================================================
 */

function parseCardWorkbook(
  rows: unknown[][],
  options: ParseOptions
): ParsedTransaction[] {
  /*
   * 실제 카드 파일은 2단 헤더다.
   *
   * 2행:
   * 이용일자
   * 카드구분
   * 이용카드
   * 매출구분
   * 이용가맹점(은행)명
   * 이용금액(해외현지/체크카드)
   * 할부개월
   * 당월결제하실금액
   * ...
   * 결제후 잔액
   * 할부가격
   *
   * 3행:
   * ...
   * 회차
   * 원금
   * 혜택금액
   * 환율
   * 수수료
   */

  const mainHeaderRowIndex =
    findRowWithKeywords(
      rows,
      [
        "이용일자",
        "이용가맹점",
        "당월결제하실금액",
      ]
    );

  if (
    mainHeaderRowIndex <
    0
  ) {
    throw new Error(
      "카드 XLS 헤더를 찾지 못했습니다. '이용일자 / 이용가맹점 / 당월결제하실금액' 영역을 확인해주세요."
    );
  }

  const mainHeaders =
    rows[
      mainHeaderRowIndex
    ] ?? [];

  const subHeaders =
    rows[
      mainHeaderRowIndex +
        1
    ] ?? [];

  const dateIndex =
    findColumn(
      mainHeaders,
      [
        "이용일자",
      ]
    );

  const cardTypeIndex =
    findColumn(
      mainHeaders,
      [
        "카드구분",
      ]
    );

  const cardIndex =
    findColumn(
      mainHeaders,
      [
        "이용카드",
      ]
    );

  const saleTypeIndex =
    findColumn(
      mainHeaders,
      [
        "매출구분",
      ]
    );

  const merchantIndex =
    findColumn(
      mainHeaders,
      [
        "이용가맹점",
      ]
    );

  const usageAmountIndex =
    findColumn(
      mainHeaders,
      [
        "이용금액",
      ]
    );

  /*
   * 2단 헤더의 하위 열
   */
  const principalIndex =
    findColumn(
      subHeaders,
      [
        "원금",
      ]
    );

  const benefitIndex =
    findColumn(
      subHeaders,
      [
        "혜택금액",
      ]
    );

  const exchangeRateIndex =
    findColumn(
      subHeaders,
      [
        "환율",
      ]
    );

  const feeIndex =
    findColumn(
      subHeaders,
      [
        "수수료",
      ]
    );

  if (
    dateIndex < 0 ||
    merchantIndex < 0 ||
    principalIndex < 0
  ) {
    throw new Error(
      "카드 XLS의 필수 열을 확인할 수 없습니다."
    );
  }

  const year =
    inferCardYear(
      options.originalFilename
    );

  /*
   * raw_data에서 보기 좋도록
   * 두 줄 헤더를 합친다.
   */
  const columnCount =
    Math.max(
      mainHeaders.length,
      subHeaders.length
    );

  const rawHeaders: string[] =
    [];

  for (
    let index = 0;
    index < columnCount;
    index += 1
  ) {
    const main =
      String(
        mainHeaders[
          index
        ] ?? ""
      ).trim();

    const sub =
      String(
        subHeaders[
          index
        ] ?? ""
      ).trim();

    if (
      main &&
      sub
    ) {
      rawHeaders.push(
        `${main} / ${sub}`
      );
    } else {
      rawHeaders.push(
        main ||
          sub ||
          `COLUMN_${
            index + 1
          }`
      );
    }
  }

  const transactions:
    ParsedTransaction[] = [];

  /*
   * 2단 헤더이므로
   * 실제 데이터는 4행부터 시작
   */
  for (
    let rowIndex =
      mainHeaderRowIndex + 2;
    rowIndex <
    rows.length;
    rowIndex += 1
  ) {
    const row =
      rows[
        rowIndex
      ] ?? [];

    const transactionDate =
      parseCardDate(
        getCell(
          row,
          dateIndex
        ),
        year
      );

    /*
     * 카드소계 / 청구합계 행은
     * 이용일자가 비어 있으므로 자동 제외된다.
     */
    if (
      !transactionDate
    ) {
      continue;
    }

    const merchant =
      normalizeText(
        getCell(
          row,
          merchantIndex
        )
      );

    const saleType =
      normalizeText(
        getCell(
          row,
          saleTypeIndex
        )
      );

    const cardType =
      normalizeText(
        getCell(
          row,
          cardTypeIndex
        )
      );

    const cardNumber =
      normalizeText(
        getCell(
          row,
          cardIndex
        )
      );

    /*
     * 원금
     *
     * 실제 해외 결제:
     *
     * 16,802 \n USD10.75
     *
     * parseMoney는 첫 번째 숫자,
     * 즉 KRW 16,802를 읽는다.
     */
    const principal =
      parseMoney(
        getCell(
          row,
          principalIndex
        )
      ) ?? 0;

    const benefit =
      benefitIndex >= 0
        ? Math.abs(
            parseMoney(
              getCell(
                row,
                benefitIndex
              )
            ) ?? 0
          )
        : 0;

    const fee =
      feeIndex >= 0
        ? Math.abs(
            parseMoney(
              getCell(
                row,
                feeIndex
              )
            ) ?? 0
          )
        : 0;

    const exchangeRate =
      exchangeRateIndex >=
      0
        ? parseMoney(
            getCell(
              row,
              exchangeRateIndex
            )
          )
        : null;

    const usageAmount =
      usageAmountIndex >=
      0
        ? parseMoney(
            getCell(
              row,
              usageAmountIndex
            )
          )
        : null;

    const principalRaw =
      normalizeText(
        getCell(
          row,
          principalIndex
        )
      );

    const foreign =
      isForeignCardTransaction(
        saleType,
        principalRaw
      );

    /*
     * 기존 관리회계 정의:
     *
     * Gross Consumption
     * = 원금 + 혜택
     *
     * Net Consumption Cost
     * = 원금 + 수수료
     *
     * 예:
     * 해외결제
     * 원금       16,802
     * 수수료         49
     * Net        16,851
     */
    const grossAmount =
      principal +
      benefit;

    const netAmount =
      principal +
      fee;

    /*
     * 취소/환불 판정
     */
    const refundText =
      [
        saleType,
        merchant,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    const isRefund =
      refundText.includes(
        "취소"
      ) ||
      refundText.includes(
        "환불"
      );

    const amount =
      isRefund
        ? Math.abs(
            netAmount
          )
        : -Math.abs(
            netAmount
          );

    const description =
      [
        saleType,
        cardType,
        cardNumber
          ? `카드 ${cardNumber}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ") ||
      null;

    const classification =
      classifyTransaction({
        sourceType:
          "CARD",

        amount,

        counterparty:
          merchant,

        description,

        transactionDate,
      });

    /*
     * 환불은 classifier 결과보다
     * 명확하므로 REFUND 우선
     */
    const transactionType =
      isRefund
        ? "REFUND"
        : classification.transactionType;

    transactions.push({
      transactionDate,

      sourceType:
        "CARD",

      accountName:
        options.defaultAccountName ??
        (
          cardNumber
            ? `카드 ${cardNumber}`
            : null
        ),

      counterparty:
        merchant,

      description,

      transactionType,

      categoryL1:
        classification.categoryL1,

      categoryL2:
        classification.categoryL2,

      fixedVariable:
        classification.fixedVariable,

      essentialOptional:
        classification.essentialOptional,

      amount,

      grossAmount,

      benefitAmount:
        benefit,

      feeAmount:
        fee,

      netAmount,

      /*
       * 해외 거래만 원화 이외의
       * 원거래금액을 따로 보관.
       */
      originalAmount:
        foreign
          ? usageAmount
          : null,

      originalCurrency:
        foreign
          ? extractCurrency(
              getCell(
                row,
                principalIndex
              )
            )
          : null,

      exchangeRate:
        foreign
          ? exchangeRate
          : null,

      /*
       * 카테고리가 아직 없으면
       * EXPENSE라도 검토 필요 상태가 된다.
       */
      reviewRequired:
        isRefund
          ? true
          : classification.reviewRequired,

      sourceRow:
        rowIndex + 1,

      rawData:
        createRawData(
          rawHeaders,
          row
        ),
    });
  }

  return transactions;
}

/*
 * =========================================================
 * Workbook Entry Point
 * =========================================================
 */

export function parseFinancialWorkbook(
  buffer: Buffer,
  options: ParseOptions
): ParsedTransaction[] {
  const workbook =
    XLSX.read(
      buffer,
      {
        type: "buffer",

        /*
         * 실제 두 파일은 .xls BIFF 형식.
         *
         * 날짜 셀도 일부 문자열로 들어있기 때문에
         * 여기서는 raw 값을 유지한다.
         */
        raw: true,
      } as XLSX.ParsingOptions
    );

  if (
    workbook.SheetNames.length ===
    0
  ) {
    throw new Error(
      "Excel 시트를 찾을 수 없습니다."
    );
  }

  const firstSheetName =
    workbook.SheetNames[0];

  const worksheet =
    workbook.Sheets[
      firstSheetName
    ];

  if (!worksheet) {
    throw new Error(
      "첫 번째 Excel 시트를 읽을 수 없습니다."
    );
  }

  const rows =
    XLSX.utils.sheet_to_json<
      unknown[]
    >(
      worksheet,
      {
        header: 1,
        defval: "",
        raw: true,

        /*
         * 빈 행도 유지해야
         * 실제 Excel 행 번호와
         * sourceRow가 맞는다.
         */
        blankrows: true,
      }
    ) as unknown[][];

  if (
    rows.length === 0
  ) {
    throw new Error(
      "Excel에 읽을 수 있는 데이터가 없습니다."
    );
  }

  if (
    options.sourceType ===
    "BANK"
  ) {
    return parseBankWorkbook(
      rows,
      options
    );
  }

  return parseCardWorkbook(
    rows,
    options
  );
}