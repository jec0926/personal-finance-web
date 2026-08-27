import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmail = process.env.ALLOWED_EMAIL?.trim().toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return false;
      }

      const email = profile?.email?.trim().toLowerCase();

      if (!email || !allowedEmail) {
        return false;
      }

      return email === allowedEmail;
    },

    authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;

      // OAuth 자체 경로와 로그인 페이지는 항상 접근 허용
      if (
        pathname === "/login" ||
        pathname.startsWith("/api/auth")
      ) {
        return true;
      }

      // 나머지는 로그인 필요
      return !!auth?.user;
    },
  },
});