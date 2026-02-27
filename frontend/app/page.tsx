"use client";

import AppNavbar from "@/components/app-navbar";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <AppNavbar />
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <h2 className="text-2xl font-semibold">Главная</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Добро пожаловать. Используйте навигацию для работы с оборудованием, отчетами и личным кабинетом.
        </p>
      </section>
    </main>
  );
}
