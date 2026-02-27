"use client";

import { useEffect, useState } from "react";
import AppNavbar from "@/components/app-navbar";
import { getApiUrl } from "@/lib/auth";
import {
  formatDateAlmaty,
  formatDateKey,
  formatDateTimeAlmaty,
  shiftDateKey,
  toDateKeyAlmaty,
} from "@/lib/datetime";

type UnknownRecord = Record<string, unknown>;

type ReportRow = {
  id: string;
  operationType: string;
  status: string;
  equipment: string;
  quantity: string;
  fromUser: string;
  toUser: string;
  performedBy: string;
  movementDate: string;
  note: string;
};

function getItems(payload: unknown): UnknownRecord[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as UnknownRecord[];
  if (typeof payload === "object") {
    const asRecord = payload as UnknownRecord;
    if (Array.isArray(asRecord.data)) return asRecord.data as UnknownRecord[];
  }
  return [];
}

function getText(entry: UnknownRecord | null, key: string) {
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

function getObject(entry: UnknownRecord | null, key: string) {
  if (!entry) return null;
  const direct = entry[key];
  if (direct && typeof direct === "object") return direct as UnknownRecord;
  const attributes = entry.attributes;
  if (attributes && typeof attributes === "object") {
    const nested = (attributes as UnknownRecord)[key];
    if (nested && typeof nested === "object") return nested as UnknownRecord;
  }
  return null;
}

function unwrap(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const asRecord = value as UnknownRecord;
  if ("data" in asRecord && asRecord.data && typeof asRecord.data === "object") {
    return asRecord.data as UnknownRecord;
  }
  return asRecord;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default function ReportsPage() {
  const PAGE_SIZE = 20;
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [activePreset, setActivePreset] = useState<"" | "1d" | "7d" | "30d">("");
  const [currentPage, setCurrentPage] = useState(1);

  function toInputDate(value: Date) {
    return toDateKeyAlmaty(value);
  }

  function applyPreset(days: number) {
    const todayKey = toInputDate(new Date());
    const fromKey = shiftDateKey(todayKey, -(days - 1));
    setDateFrom(fromKey);
    setDateTo(todayKey);
    if (days === 1) setActivePreset("1d");
    if (days === 7) setActivePreset("7d");
    if (days === 30) setActivePreset("30d");
  }

  function clearDates() {
    setDateFrom("");
    setDateTo("");
    setActivePreset("");
  }

  function toggleTypeFilter(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    );
  }

  function resetAllFilters() {
    setSearch("");
    setSelectedTypes([]);
    clearDates();
  }

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const params = new URLSearchParams();
        params.append("populate[0]", "equipment");
        params.append("populate[1]", "from_user");
        params.append("populate[2]", "to_user");
        params.append("populate[3]", "performed_by");
        params.append("sort[0]", "movementDate:desc");
        const response = await fetch(`${getApiUrl()}/api/movements?${params.toString()}`, {
          headers,
        });

        if (!response.ok) throw new Error("Не удалось загрузить отчет");

        const payload = await response.json();
        const mapped = getItems(payload)
          .map((row) => {
          const equipment = unwrap(getObject(row, "equipment"));
          const fromUser = unwrap(getObject(row, "from_user"));
          const toUser = unwrap(getObject(row, "to_user"));
          const performedBy = unwrap(getObject(row, "performed_by"));
          return {
            id: getText(row, "documentId") || getText(row, "id"),
            operationType: getText(row, "operationType"),
            status: getText(row, "status"),
            equipment: getText(equipment, "name"),
            quantity: getText(row, "quantity"),
            fromUser: getText(fromUser, "username") || getText(fromUser, "email"),
            toUser: getText(toUser, "username") || getText(toUser, "email"),
            performedBy: getText(performedBy, "username") || getText(performedBy, "email"),
            movementDate: getText(row, "movementDate"),
            note: getText(row, "note"),
          };
          })
          .filter((row) => row.status === "COMPLETED");

        setRows(mapped);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const typeOptions = Array.from(
    new Set(rows.map((row) => row.operationType).filter((value) => value))
  ).sort((a, b) => a.localeCompare(b));

  const filteredRows = rows.filter((row) => {
    if (selectedTypes.length > 0 && !selectedTypes.includes(row.operationType)) return false;

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      const haystack = [
        row.operationType,
        row.equipment,
        row.quantity,
        row.fromUser,
        row.toUser,
        row.performedBy,
        row.movementDate,
        row.note,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (!dateFrom && !dateTo) return true;
    if (!row.movementDate) return false;
    const rowDateKey = toDateKeyAlmaty(row.movementDate);
    if (!rowDateKey) return false;
    if (dateFrom && rowDateKey < dateFrom) return false;
    if (dateTo && rowDateKey > dateTo) return false;
    return true;
  });

  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredRows.length);
  const pageRows = filteredRows.slice(startIndex, startIndex + PAGE_SIZE);

  const quickDateBtnClass = (isActive: boolean) =>
    `rounded-md border px-3 py-2 text-sm transition ${
      isActive
        ? "border-zinc-900 bg-zinc-900 text-white"
        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
    }`;

  function downloadAct() {
    const generatedAt = new Date();
    const filtersSummary = [
      selectedTypes.length > 0 ? `Типы: ${selectedTypes.join(", ")}` : "Типы: все",
      dateFrom || dateTo
        ? `Период: ${formatDateKey(dateFrom)} по ${formatDateKey(dateTo)}`
        : "Период: все даты",
    ];

    const rowsHtml = filteredRows
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.operationType || "—")}</td>
            <td>${escapeHtml(row.equipment || "—")}</td>
            <td>${escapeHtml(row.quantity || "—")}</td>
            <td>${escapeHtml(row.fromUser || "—")}</td>
            <td>${escapeHtml(row.toUser || "—")}</td>
            <td>${escapeHtml(formatDateAlmaty(row.movementDate || ""))}</td>
            <td>${escapeHtml(row.note || "—")}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Акт операций</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; }
            h1 { font-size: 18px; margin-bottom: 8px; }
            p { margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #999; padding: 6px; vertical-align: top; }
            th { background: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Акт / Журнал операций</h1>
          <p>Дата формирования: ${formatDateTimeAlmaty(generatedAt)}</p>
          ${filtersSummary.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
          <p>Всего записей: ${filteredRows.length}</p>
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Тип</th>
                <th>Оборудование</th>
                <th>Кол-во</th>
                <th>От МОЛ</th>
                <th>К МОЛ</th>
                <th>Дата</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="8">Нет операций</td></tr>`}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([`\ufeff${html}`], {
      type: "application/msword;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = generatedAt.toISOString().slice(0, 19).replaceAll(":", "-");
    link.href = url;
    link.download = `act-report-${stamp}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedTypes, dateFrom, dateTo]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <main className="min-h-screen bg-zinc-50">
      <AppNavbar />
      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-2xl font-semibold">Журнал/отчет операций</h2>
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-600">
                Найдено: <span className="font-semibold text-zinc-900">{filteredRows.length}</span>
                {" · "}
                Активные фильтры:{" "}
                <span className="font-semibold text-zinc-900">{activeFiltersCount}</span>
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
              >
                Сбросить все
              </button>
              <button
                type="button"
                onClick={downloadAct}
                className="rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading}
              >
                Сформировать акт
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по журналу..."
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((type) => (
                  <label
                    key={type}
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTypes.includes(type)}
                      onChange={() => toggleTypeFilter(type)}
                    />
                    <span>{type}</span>
                  </label>
                ))}
                {typeOptions.length === 0 ? (
                  <span className="text-sm text-zinc-500">Нет типов</span>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => applyPreset(1)}
              className={quickDateBtnClass(activePreset === "1d")}
            >
              1 день
            </button>
            <button
              type="button"
              onClick={() => applyPreset(7)}
              className={quickDateBtnClass(activePreset === "7d")}
            >
              Неделя
            </button>
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className={quickDateBtnClass(activePreset === "30d")}
            >
              Месяц
            </button>
            <label className="ml-2 text-sm text-zinc-700">
              От
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setActivePreset("");
                }}
                className="ml-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-sm text-zinc-700">
              По
              <input
                type="date"
                value={dateTo}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setActivePreset("");
                }}
                className="ml-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={clearDates}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
            >
              Сбросить даты
            </button>
          </div>
          </div>
          {loading ? <p className="mt-4 text-zinc-600">Загрузка...</p> : null}
          {error ? <p className="mt-4 text-red-600">{error}</p> : null}
          {!loading && !error ? (
            <>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200">
                <table className="min-w-full border-collapse bg-white">
                  <thead>
                    <tr className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3">Тип</th>
                      <th className="px-4 py-3">Оборудование</th>
                      <th className="px-4 py-3">Кол-во</th>
                      <th className="px-4 py-3">От МОЛ</th>
                      <th className="px-4 py-3">К МОЛ</th>
                      <th className="px-4 py-3">Инициатор</th>
                      <th className="px-4 py-3">Дата</th>
                      <th className="px-4 py-3">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100 text-sm transition hover:bg-zinc-50/60">
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                            {row.operationType || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-800">{row.equipment || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{row.quantity || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{row.fromUser || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{row.toUser || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{row.performedBy || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{formatDateTimeAlmaty(row.movementDate || "")}</td>
                        <td className="px-4 py-3 text-zinc-700">{row.note || "—"}</td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8 text-center text-zinc-500" colSpan={8}>
                          Нет операций
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zinc-600">
                    Показано {startIndex + 1}-{endIndex} из {filteredRows.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
                      disabled={currentPage <= 1}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
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
