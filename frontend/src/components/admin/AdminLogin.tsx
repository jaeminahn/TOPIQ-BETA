import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { adminApi } from "../../api";
import { supabase } from "../../supabase";

export function AdminLogin({ onReady }: { onReady: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const accessToken = supabase
        ? (await supabase.auth.signInWithPassword({ email, password })).data.session?.access_token
        : (await adminApi.login(email, password)).accessToken;
      if (!accessToken) throw new Error("로그인에 실패했습니다.");
      await adminApi.me(accessToken);
      sessionStorage.setItem("unigate.topik.admin.token", accessToken);
      onReady(accessToken);
    } catch (cause) {
      await supabase?.auth.signOut();
      setError(cause instanceof Error ? cause.message : "관리자 권한이 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-gray-100 p-5">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-2xl border border-gray-300 bg-white p-8 sm:p-10">
        <p className="text-xs font-semibold tracking-[.16em] text-primary">UNIGATE TOPIK ADMIN</p>
        <h1 className="mt-2 text-3xl font-semibold text-gray-900">관리자 로그인</h1>
        <label className="mt-8 block text-sm font-semibold text-gray-700">이메일<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3.5 font-medium text-gray-900 outline-none focus:border-primary" /></label>
        <label className="mt-4 block text-sm font-semibold text-gray-700">비밀번호<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border-2 border-gray-200 px-4 py-3.5 font-medium text-gray-900 outline-none focus:border-primary" /></label>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        <button disabled={loading} className="focus-ring mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 font-semibold text-white hover:bg-primary-dark disabled:opacity-60">{loading && <LoaderCircle className="size-4 animate-spin" />} 로그인</button>
      </form>
    </main>
  );
}
