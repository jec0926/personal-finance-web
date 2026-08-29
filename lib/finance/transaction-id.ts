import { createHash } from "node:crypto";

import { ParsedTransaction } from "./types";

export function sha256Buffer(
  buffer: Buffer
) {
  return createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function normalizeText(
  value: string | null
) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function getTransactionIdentityBase(
  transaction: ParsedTransaction
) {
  return [
    transaction.sourceType,
    transaction.transactionDate,

    normalizeText(
      transaction.accountName
    ),

    normalizeText(
      transaction.counterparty
    ),

    normalizeText(
      transaction.description
    ),

    transaction.amount,

    transaction.grossAmount ?? "",
    transaction.benefitAmount ?? "",
    transaction.feeAmount ?? "",
    transaction.netAmount ?? "",

    transaction.originalAmount ?? "",
    transaction.originalCurrency ?? "",
    transaction.exchangeRate ?? "",
  ].join("|");
}

export function buildTransactionId(
  transaction: ParsedTransaction,
  occurrence: number
) {
  const base =
    getTransactionIdentityBase(
      transaction
    );

  return createHash("sha256")
    .update(
      `${base}|occurrence:${occurrence}`
    )
    .digest("hex");
}