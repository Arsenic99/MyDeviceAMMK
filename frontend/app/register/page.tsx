"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const resolvedUsername = username.trim() || email.split("@")[0] || "user";
      const result = await register(resolvedUsername, email, password);
      localStorage.setItem("token", result.jwt);
      localStorage.setItem("user", JSON.stringify(result.user));
      document.cookie = `token=${result.jwt}; Path=/; Max-Age=604800; SameSite=Lax`;
      router.replace("/");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Registration failed"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <form onSubmit={handleSubmit} className="w-full space-y-4 rounded-xl border p-6">
        <h1 className="text-2xl font-semibold">Register</h1>
        <input
          className="w-full rounded-md border px-3 py-2"
          type="text"
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <input
          className="w-full rounded-md border px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="w-full rounded-md border px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          className="w-full rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
        <p className="text-sm">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Login
          </Link>
        </p>
      </form>
    </main>
  );
}
