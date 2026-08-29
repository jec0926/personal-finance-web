"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

type SourceType =
  | "BANK"
  | "CARD";

type UploadBatch = {
  id: string;

  source_type: SourceType;

  original_filename: string;

  status:
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED";

  parsed_count: number;
  inserted_count: number;
  duplicate_count: number;

  error_message:
    | string
    | null;

  created_at: string;

  completed_at:
    | string
    | null;
};

export default function FinanceUploadPage() {
  const [
    sourceType,
    setSourceType,
  ] =
    useState<SourceType>(
      "BANK"
    );

  const [
    accountName,
    setAccountName,
  ] =
    useState("");

  const [
    selectedFile,
    setSelectedFile,
  ] =
    useState<File | null>(
      null
    );

  const [
    batches,
    setBatches,
  ] =
    useState<
      UploadBatch[]
    >([]);

  const [
    uploading,
    setUploading,
  ] =
    useState(false);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(null);

  async function loadBatches() {
    setLoading(true);

    try {
      const response =
        await fetch(
          "/api/finance/upload",
          {
            cache:
              "no-store",
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ??
            "업로드 이력을 불러오지 못했습니다."
        );
      }

      setBatches(
        data.batches ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBatches();
  }, []);

  async function handleSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!selectedFile) {
      setError(
        "파일을 선택해주세요."
      );

      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        selectedFile
      );

      formData.append(
        "sourceType",
        sourceType
      );

      formData.append(
        "accountName",
        accountName
      );

      const response =
        await fetch(
          "/api/finance/upload",
          {
            method: "POST",

            body: formData,
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ??
            "업로드에 실패했습니다."
        );
      }

      setMessage(
        [
          `${data.filename} 처리 완료`,
          `읽은 거래 ${data.parsedCount}건`,
          `신규 저장 ${data.insertedCount}건`,
          `중복 ${data.duplicateCount}건`,
        ].join(" · ")
      );

      setSelectedFile(
        null
      );

      await loadBatches();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "업로드 중 오류가 발생했습니다."
      );
    } finally {
      setUploading(false);
    }
  }

  function formatDate(
    value: string
  ) {
    return new Date(
      value
    ).toLocaleString(
      "ko-KR"
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header>
          <p className="text-sm font-medium text-gray-500">
            생활금융
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            데이터 업로드
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            은행 및 카드 Excel
            거래내역을 업로드합니다.
          </p>
        </header>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {message}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Excel 거래내역 등록
          </h2>

          <form
            onSubmit={
              handleSubmit
            }
            className="mt-6 grid gap-5 md:grid-cols-2"
          >
            <label>
              <span className="text-sm font-medium text-gray-700">
                자료 구분
              </span>

              <select
                value={
                  sourceType
                }
                onChange={(
                  event
                ) =>
                  setSourceType(
                    event.target
                      .value as SourceType
                  )
                }
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
              >
                <option value="BANK">
                  은행
                </option>

                <option value="CARD">
                  카드
                </option>
              </select>
            </label>

            <label>
              <span className="text-sm font-medium text-gray-700">
                계좌/카드 표시명
              </span>

              <input
                value={
                  accountName
                }
                onChange={(
                  event
                ) =>
                  setAccountName(
                    event.target
                      .value
                  )
                }
                placeholder="예: 우리은행 본계좌"
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-medium text-gray-700">
                XLS / XLSX
              </span>

              <input
                type="file"
                accept=".xls,.xlsx"
                onChange={(
                  event
                ) => {
                  setSelectedFile(
                    event.target
                      .files?.[0] ??
                      null
                  );
                }}
                className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
              />
            </label>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={
                  uploading
                }
                className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {uploading
                  ? "처리 중..."
                  : "업로드 및 거래 등록"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                최근 업로드
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                동일 파일은
                fingerprint를 기준으로
                중복 등록되지 않습니다.
              </p>
            </div>

            <a
              href="/finance/transactions"
              className="text-sm font-medium text-gray-700 underline"
            >
              거래내역 보기
            </a>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                불러오는 중...
              </div>
            ) : batches.length ===
              0 ? (
              <div className="p-8 text-center text-gray-500">
                아직 업로드한
                파일이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-3">
                        일시
                      </th>

                      <th className="px-4 py-3">
                        구분
                      </th>

                      <th className="px-4 py-3">
                        파일
                      </th>

                      <th className="px-4 py-3 text-right">
                        읽음
                      </th>

                      <th className="px-4 py-3 text-right">
                        신규
                      </th>

                      <th className="px-4 py-3 text-right">
                        중복
                      </th>

                      <th className="px-4 py-3">
                        상태
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {batches.map(
                      (batch) => (
                        <tr
                          key={
                            batch.id
                          }
                          className="border-t border-gray-100"
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                            {formatDate(
                              batch.created_at
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {batch.source_type ===
                            "BANK"
                              ? "은행"
                              : "카드"}
                          </td>

                          <td className="px-4 py-3 font-medium text-gray-800">
                            {
                              batch.original_filename
                            }

                            {batch.error_message && (
                              <p className="mt-1 text-xs text-red-600">
                                {
                                  batch.error_message
                                }
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right tabular-nums">
                            {
                              batch.parsed_count
                            }
                          </td>

                          <td className="px-4 py-3 text-right tabular-nums">
                            {
                              batch.inserted_count
                            }
                          </td>

                          <td className="px-4 py-3 text-right tabular-nums">
                            {
                              batch.duplicate_count
                            }
                          </td>

                          <td className="px-4 py-3">
                            {batch.status ===
                            "COMPLETED"
                              ? "처리완료"
                              : batch.status ===
                                  "FAILED"
                                ? "실패"
                                : "처리 중"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}