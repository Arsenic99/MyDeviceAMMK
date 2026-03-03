"use client";

import AppNavbar from "@/components/app-navbar";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <AppNavbar />
      <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <h2 className="text-xl font-semibold sm:text-2xl">Главная</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Добро пожаловать. Используйте навигацию для работы с оборудованием, отчетами и личным кабинетом.
        </p>
      </section>
    </main>
  );
}
