import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              개인 자산관리
            </h1>

            <p className="mt-2 text-gray-500">
              수입·지출·투자·자산·부채를 통합 관리합니다.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {session.user.email}
            </span>

            <form
              action={async () => {
                "use server";
                await signOut({
                  redirectTo: "/login",
                });
              }}
            >
              <button
                type="submit"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {[
            "월 수입",
            "생활비",
            "투자자산",
            "순자산",
          ].map((title) => (
            <div
              key={title}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <p className="text-sm text-gray-500">{title}</p>
              <p className="mt-3 text-2xl font-bold text-gray-900">
                -
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}