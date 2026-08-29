export type SourceType =
  | "BANK"
  | "CARD";

export type TransactionType =
  | "EXPENSE"
  | "INCOME"
  | "CARD_SETTLEMENT"
  | "DEBT_PAYMENT"
  | "INVESTMENT_TRANSFER"
  | "INTERNAL_TRANSFER"
  | "REFUND"
  | "REIMBURSEMENT"
  | "OTHER"
  | "REVIEW_REQUIRED";

export type FixedVariable =
  | "FIXED"
  | "VARIABLE"
  | null;

export type EssentialOptional =
  | "ESSENTIAL"
  | "OPTIONAL"
  | null;

export type ClassificationResult = {
  transactionType: TransactionType;

  categoryL1: string | null;
  categoryL2: string | null;

  fixedVariable: FixedVariable;

  essentialOptional:
    EssentialOptional;

  reviewRequired: boolean;
};

export type ParsedTransaction = {
  transactionDate: string;

  sourceType: SourceType;

  accountName: string | null;

  counterparty: string | null;
  description: string | null;

  transactionType:
    TransactionType;

  categoryL1: string | null;
  categoryL2: string | null;

  fixedVariable:
    FixedVariable;

  essentialOptional:
    EssentialOptional;

  amount: number;

  grossAmount: number | null;
  benefitAmount: number | null;
  feeAmount: number | null;
  netAmount: number | null;

  originalAmount: number | null;
  originalCurrency: string | null;
  exchangeRate: number | null;

  reviewRequired: boolean;

  sourceRow: number;

  rawData: Record<
    string,
    unknown
  >;
};