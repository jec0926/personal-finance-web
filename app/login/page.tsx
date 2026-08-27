import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            개인 자산관리
          </h1>

          <p className="mt-3 text-sm text-gray-500">
            등록된 Google 계정으로 로그인해주세요.
          </p>
        </div>

        <form
          className="mt-8"
          action={async () => {
            "use server";

            await signIn("google", {
              redirectTo: "/",
            });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Google 계정으로 로그인
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          허용된 계정만 접근할 수 있습니다.
        </p>
      </div>
    </main>
  );
}