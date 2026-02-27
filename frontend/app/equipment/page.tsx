"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppNavbar from "@/components/app-navbar";
import { getApiUrl } from "@/lib/auth";

type EquipmentRow = {
  id: number | string;
  detailKey: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  username: string;
};

type UnknownRecord = Record<string, unknown>;

function unwrapRelation(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object") return null;
  const asRecord = value as UnknownRecord;
  if ("data" in asRecord && asRecord.data && typeof asRecord.data === "object") {
    return asRecord.data as UnknownRecord;
  }
  return asRecord;
}

function getTextField(entry: UnknownRecord | null, key: string) {
  if (!entry) return "";
  const direct = entry[key];
  if (typeof direct === "string" || typeof direct === "number") return String(direct);

  const attributes = entry.attributes;
  if (attributes && typeof attributes === "object") {
    const nested = (attributes as UnknownRecord)[key];
    if (typeof nested === "string" || typeof nested === "number") return String(nested);
  }

  return "";
}

export default function EquipmentPage() {
  const PAGE_SIZE = 20;
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  function isEmpty(row: EquipmentRow) {
    const qty = Number(row.quantity);
    return Number.isFinite(qty) && qty <= 0;
  }

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem("token");
        const params = new URLSearchParams();
        params.append("populate[0]", "equipment");
        params.append("populate[1]", "users_permissions_user");

        const response = await fetch(`${getApiUrl()}/api/inventories?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error("Не удалось загрузить оборудование");
        }

        const payload = (await response.json()) as
          | { data?: UnknownRecord[] }
          | UnknownRecord[];
        const items = Array.isArray(payload)
          ? payload
          : Array.isArray(payload.data)
            ? payload.data
            : [];

        const mapped = items.map((item, index) => {
          const equipment = unwrapRelation(item.equipment);
          const user = unwrapRelation(item.users_permissions_user);
          const id = getTextField(item, "id") || index;

          return {
            id,
            detailKey: getTextField(item, "documentId") || String(id),
            name: getTextField(equipment, "name") || "—",
            quantity: getTextField(item, "quantity") || "—",
            unit: getTextField(equipment, "unit") || "—",
            category: getTextField(equipment, "category") || "—",
            username:
              getTextField(user, "username") || getTextField(user, "email") || "—",
          };
        });

        setRows(mapped);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filteredRows = rows.filter((row) => {
    if (isEmpty(row)) return false;
    if (selectedCategories.length > 0 && !selectedCategories.includes(row.category)) return false;
    if (selectedUsers.length > 0 && !selectedUsers.includes(row.username)) return false;
    const query = search.trim().toLowerCase();
    if (query) {
      const haystack = `${row.name} ${row.category} ${row.username} ${row.unit}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const nonEmptyRows = rows.filter((row) => !isEmpty(row));

  const categoryOptions = Array.from(
    new Set(nonEmptyRows.map((row) => row.category).filter((value) => value && value !== "—"))
  ).sort((a, b) => a.localeCompare(b));

  const userOptions = Array.from(
    new Set(nonEmptyRows.map((row) => row.username).filter((value) => value && value !== "—"))
  ).sort((a, b) => a.localeCompare(b));

  function toggleCategory(value: string) {
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  }

  function toggleUser(value: string) {
    setSelectedUsers((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  }

  function resetFilters() {
    setSearch("");
    setSelectedCategories([]);
    setSelectedUsers([]);
  }

  const allCategoriesSelected =
    categoryOptions.length > 0 && selectedCategories.length === categoryOptions.length;
  const allUsersSelected = userOptions.length > 0 && selectedUsers.length === userOptions.length;
  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (selectedCategories.length > 0 ? 1 : 0) +
    (selectedUsers.length > 0 ? 1 : 0);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredRows.length);
  const pageRows = filteredRows.slice(startIndex, startIndex + PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategories, selectedUsers]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5f7ff_0%,_#f8fafc_45%,_#f5f5f4_100%)]">
      <AppNavbar />
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white/90 shadow-[0_10px_35px_-20px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Список оборудования</h2>
              <p className="text-sm text-zinc-500">
                Поиск и фильтрация по категории и материально ответственному лицу
              </p>
            </div>
            <div className="w-full max-w-md">
              <label htmlFor="equipment-search" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Поиск
              </label>
              <input
                id="equipment-search"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Наименование, категория, МОЛ, ед. измерения"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-zinc-400 focus:shadow"
              />
            </div>
          </div>
          <div className="mx-6 mt-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              {filtersOpen ? "Скрыть фильтры" : "Показать фильтры"}
            </button>
          </div>
          {filtersOpen ? (
            <div className="mx-6 mt-2 rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-zinc-600">
                Найдено: <span className="font-semibold text-zinc-900">{filteredRows.length}</span>
                {" · "}
                Активные фильтры: <span className="font-semibold text-zinc-900">{activeFiltersCount}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                >
                  Сбросить
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedCategories(allCategoriesSelected ? [] : categoryOptions)
                  }
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                >
                  {allCategoriesSelected ? "Снять категории" : "Выбрать все категории"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUsers(allUsersSelected ? [] : userOptions)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                >
                  {allUsersSelected ? "Снять МОЛ" : "Выбрать всех МОЛ"}
                </button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-zinc-700">Категории</p>
                <div className="flex flex-wrap gap-3">
                  {categoryOptions.map((category) => (
                    <label
                      key={category}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm transition hover:border-zinc-300"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300"
                        checked={selectedCategories.includes(category)}
                        onChange={() => toggleCategory(category)}
                      />
                      <span>{category}</span>
                    </label>
                  ))}
                  {categoryOptions.length === 0 ? (
                    <span className="text-sm text-zinc-500">Нет категорий</span>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-zinc-700">МОЛ</p>
                <div className="flex flex-wrap gap-3">
                  {userOptions.map((username) => (
                    <label
                      key={username}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm transition hover:border-zinc-300"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300"
                        checked={selectedUsers.includes(username)}
                        onChange={() => toggleUser(username)}
                      />
                      <span>{username}</span>
                    </label>
                  ))}
                  {userOptions.length === 0 ? (
                    <span className="text-sm text-zinc-500">Нет пользователей</span>
                  ) : null}
                </div>
              </div>
            </div>
            </div>
          ) : null}
          {loading ? <p className="mx-6 mt-4 text-zinc-600">Загрузка...</p> : null}
          {error ? <p className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{error}</p> : null}
          {!loading && !error ? (
            <>
              <div className="mx-6 my-6 overflow-x-auto rounded-2xl border border-zinc-200">
                <table className="min-w-full border-collapse bg-white">
                  <thead>
                    <tr className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3">Наименование оборудования</th>
                      <th className="px-4 py-3">Категория</th>
                      <th className="px-4 py-3">Кол-во</th>
                      <th className="px-4 py-3">Ед. измерения</th>
                      <th className="px-4 py-3">МОЛ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100 text-sm transition hover:bg-zinc-50/60">
                      <td className="px-4 py-3 font-medium text-zinc-800">
                        <Link
                          className="text-blue-700 underline-offset-2 hover:underline"
                          href={`/equipment/${row.detailKey}`}
                        >
                          {row.name}
                        </Link>
                      </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                            {row.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{row.quantity}</td>
                        <td className="px-4 py-3 text-zinc-700">{row.unit}</td>
                        <td className="px-4 py-3 text-zinc-700">{row.username}</td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>
                          Нет данных
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 0 ? (
                <div className="mx-6 mb-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zinc-600">
                    Показано {startIndex + 1}-{endIndex} из {filteredRows.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
                      disabled={currentPage <= 1}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Назад
                    </button>
                    <span className="text-sm text-zinc-700">
                      Страница {currentPage} из {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
                      disabled={currentPage >= totalPages}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Вперед
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
