import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function KftcTestPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">
          금융결제원 오픈뱅킹 연결 테스트
        </h1>

        <p className="mt-3 text-gray-500">
          오픈뱅킹 사용자 인증과 등록계좌 조회를
          테스트합니다.
        </p>

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900">
            오픈뱅킹
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            현재 단계에서는 금융데이터를 저장하지 않습니다.
          </p>

          <a
            href="/api/kftc/connect"
            className="mt-6 inline-block rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white"
          >
            금융결제원 오픈뱅킹 연결
          </a>
        </div>
      </div>
    </main>
  );
}