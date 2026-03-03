"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import AppNavbar from "@/components/app-navbar";
import { getApiUrl } from "@/lib/auth";

type MinimalPart = {
  id: string;
  name: string;
  article: string;
  quantity: string;
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

function getItems(payload: unknown): UnknownRecord[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as UnknownRecord[];
  if (typeof payload === "object") {
    const asRecord = payload as UnknownRecord;
    if (Array.isArray(asRecord.data)) return asRecord.data as UnknownRecord[];
  }
  return [];
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export default function MinimalPartsPage() {
  const [parts, setParts] = useState<MinimalPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stockByKey, setStockByKey] = useState<Record<string, number>>({});
  const [showOnlyShortage, setShowOnlyShortage] = useState(false);
  const [actionRowId, setActionRowId] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [editingRow, setEditingRow] = useState<MinimalPart | null>(null);
  const [editName, setEditName] = useState("");
  const [editArticle, setEditArticle] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [name, setName] = useState("");
  const [article, setArticle] = useState("");
  const [quantity, setQuantity] = useState("");

  useEffect(() => {
    async function loadData() {
      const token = localStorage.getItem("token");
      try {
        setError("");

        const [partsResponse, inventoriesResponse] = await Promise.all([
          fetch(`${getApiUrl()}/api/minimal-parts?sort[0]=name:asc`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }),
          fetch(`${getApiUrl()}/api/inventories?populate[0]=equipment`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }),
        ]);

        if (!partsResponse.ok) {
          throw new Error("Не удалось загрузить минимальный список запчастей");
        }
        if (!inventoriesResponse.ok) {
          throw new Error("Не удалось загрузить остатки оборудования");
        }

        const partsPayload = await partsResponse.json();
        const partRows = getItems(partsPayload).map((row) => {
          const id = getText(row, "documentId") || getText(row, "id");
          return {
            id,
            name: getText(row, "name"),
            article: getText(row, "article"),
            quantity: getText(row, "quantity"),
          } as MinimalPart;
        });

        const inventoriesPayload = await inventoriesResponse.json();
        const inventoriesRows = getItems(inventoriesPayload);
        const nextMap: Record<string, number> = {};
        for (const row of inventoriesRows) {
          const equipment = unwrapRelation(row.equipment);
          const equipmentName = getText(equipment, "name");
          const equipmentArticle = getText(equipment, "article");
          const qty = Number(getText(row, "quantity"));
          if (!equipmentName || !equipmentArticle || !Number.isFinite(qty)) continue;
          const key = `${normalize(equipmentName)}::${normalize(equipmentArticle)}`;
          nextMap[key] = (nextMap[key] || 0) + qty;
        }

        setParts(partRows.filter((row) => row.id));
        setStockByKey(nextMap);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (!actionRowId) return;

    const closeMenu = () => {
      setActionRowId("");
      setMenuPosition(null);
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest("[data-minimal-parts-menu]") ||
        target.closest("[data-minimal-parts-menu-trigger]")
      ) {
        return;
      }
      closeMenu();
    };

    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [actionRowId]);

  const rows = useMemo(
    () =>
      parts.map((part) => {
        const key = `${normalize(part.name)}::${normalize(part.article)}`;
        const available = stockByKey[key] ?? 0;
        const required = Number(part.quantity);
        const isLow = Number.isFinite(required) && available < required;
        return { ...part, available, isLow };
      }),
    [parts, stockByKey]
  );

  const visibleRows = useMemo(
    () => (showOnlyShortage ? rows.filter((row) => row.isLow) : rows),
    [rows, showOnlyShortage]
  );

  function exportPurchaseRequestExcel() {
    const shortageRows = rows
      .map((row) => {
        const required = Number(row.quantity);
        const missing = Number.isFinite(required) ? Math.max(required - row.available, 0) : 0;
        return { ...row, missing };
      })
      .filter((row) => row.missing > 0);

    if (shortageRows.length === 0) {
      return;
    }

    const dateLabel = new Date().toLocaleDateString("ru-RU");
    const tableRows = shortageRows
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${row.name}</td>
            <td>${row.article}</td>
            <td>${row.missing}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table border="1" cellspacing="0" cellpadding="6">
          <tr><th colspan="4">Заявка на закуп (${dateLabel})</th></tr>
          <tr>
            <th>№</th>
            <th>Наименование</th>
            <th>Артикул</th>
            <th>Количество</th>
          </tr>
          ${tableRows}
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zayavka-zakup-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function addRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("token");
    const nextName = name.trim();
    const nextArticle = article.trim();
    const parsedQuantity = Number(quantity);
    if (!nextName || !nextArticle || !Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      return;
    }
    const nextKey = `${normalize(nextName)}::${normalize(nextArticle)}`;
    const duplicate = parts.some(
      (part) => `${normalize(part.name)}::${normalize(part.article)}` === nextKey
    );
    if (duplicate) {
      setError("Такая строка уже существует");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${getApiUrl()}/api/minimal-parts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          data: {
            name: nextName,
            article: nextArticle,
            quantity: parsedQuantity,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось добавить строку");
      }

      const payload = await response.json();
      const row = getItems(payload)[0] || unwrapRelation((payload as UnknownRecord).data);
      const created: MinimalPart = {
        id: getText(row as UnknownRecord, "documentId") || getText(row as UnknownRecord, "id"),
        name: getText(row as UnknownRecord, "name"),
        article: getText(row as UnknownRecord, "article"),
        quantity: getText(row as UnknownRecord, "quantity"),
      };

      setParts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setArticle("");
      setQuantity("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(row: MinimalPart) {
    setEditingRow(row);
    setEditName(row.name);
    setEditArticle(row.article);
    setEditQuantity(row.quantity);
    setActionRowId("");
    setMenuPosition(null);
    setError("");
  }

  function closeEdit() {
    if (editSaving) return;
    setEditingRow(null);
    setEditName("");
    setEditArticle("");
    setEditQuantity("");
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRow) return;

    const token = localStorage.getItem("token");
    const nextName = editName.trim();
    const nextArticle = editArticle.trim();
    const parsedQuantity = Number(editQuantity);
    if (!nextName || !nextArticle || !Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      return;
    }

    const nextKey = `${normalize(nextName)}::${normalize(nextArticle)}`;
    const duplicate = parts.some(
      (part) =>
        part.id !== editingRow.id &&
        `${normalize(part.name)}::${normalize(part.article)}` === nextKey
    );
    if (duplicate) {
      setError("Такая строка уже существует");
      return;
    }

    setEditSaving(true);
    setError("");
    try {
      const response = await fetch(`${getApiUrl()}/api/minimal-parts/${editingRow.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          data: {
            name: nextName,
            article: nextArticle,
            quantity: parsedQuantity,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить строку");
      }

      setParts((prev) =>
        prev
          .map((row) =>
            row.id === editingRow.id
              ? {
                  ...row,
                  name: nextName,
                  article: nextArticle,
                  quantity: String(parsedQuantity),
                }
              : row
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      closeEdit();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Ошибка обновления");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteRow(row: MinimalPart) {
    const confirmed = window.confirm("Удалить строку?");
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    setActionRowId("");
    setMenuPosition(null);
    setError("");
    try {
      const response = await fetch(`${getApiUrl()}/api/minimal-parts/${row.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error("Не удалось удалить строку");
      }
      setParts((prev) => prev.filter((item) => item.id !== row.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Ошибка удаления");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f5f7ff_0%,#f8fafc_45%,#f5f5f4_100%)]">
      <AppNavbar />
      <section className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-[0_10px_35px_-20px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold">Минимальный список запчастей</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOnlyShortage((value) => !value)}
                className={`rounded-md border px-3 py-2 text-sm ${
                  showOnlyShortage
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-zinc-300 bg-white text-zinc-700"
                }`}
              >
                {showOnlyShortage ? "Показаны только дефицитные" : "Показать только дефицитные"}
              </button>
              <button
                type="button"
                onClick={exportPurchaseRequestExcel}
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white"
              >
                Сформировать заявку (Excel)
              </button>
            </div>
          </div>

          <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={addRow}>
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Наименование"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Артикул"
              value={article}
              onChange={(event) => setArticle(event.target.value)}
              required
            />
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder="Количество"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
            <button
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              type="submit"
              disabled={saving}
            >
              {saving ? "Сохранение..." : "Добавить строку"}
            </button>
          </form>

          {loading ? <p className="mt-4 text-zinc-600">Загрузка...</p> : null}
          {error ? <p className="mt-4 text-red-600">{error}</p> : null}

          <div className="mt-4 overflow-visible rounded-2xl border border-zinc-200 bg-white">
            <div
              className="overflow-x-auto overflow-y-visible"
              data-minimal-parts-table-wrap="true"
            >
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Наименование</th>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Количество</th>
                  <th className="px-4 py-3">Имеется на складе</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  return (
                  <tr key={row.id} className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/60">
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3">{row.article}</td>
                    <td className="px-4 py-3">{row.quantity}</td>
                    <td className={`px-4 py-3 font-medium ${row.isLow ? "text-red-600" : "text-zinc-800"}`}>
                      {row.available}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          data-minimal-parts-menu-trigger="true"
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-base leading-none text-zinc-500 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-700 cursor-pointer"
                          onClick={(event) => {
                            const button = event.currentTarget as HTMLButtonElement;
                            event.stopPropagation();

                            if (actionRowId === row.id) {
                              setActionRowId("");
                              setMenuPosition(null);
                              return;
                            }

                            const rect = button.getBoundingClientRect();
                            const menuWidth = 160;
                            const rawLeft = rect.right - menuWidth;
                            const left = Math.max(8, Math.min(rawLeft, window.innerWidth - menuWidth - 8));
                            const top = rect.bottom + 2;
                            setMenuPosition({ top, left });
                            setActionRowId(row.id);
                          }}
                        >
                          ⋮
                        </button>
                        {actionRowId === row.id && menuPosition
                          ? createPortal(
                              <div
                                data-minimal-parts-menu="true"
                                className="fixed z-999 w-40 rounded-xl border border-zinc-200 bg-white/95 p-1.5 shadow-lg backdrop-blur"
                                style={{ top: menuPosition.top, left: menuPosition.left }}
                              >
                                <button
                                  type="button"
                                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100"
                                  onClick={() => openEdit(row)}
                                >
                                  Редактировать
                                </button>
                                <button
                                  type="button"
                                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-50"
                                  onClick={() => deleteRow(row)}
                                >
                                  Удалить
                                </button>
                              </div>,
                              document.body
                            )
                          : null}
                      </div>
                    </td>
                  </tr>
                )})}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>
                      Список пуст
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </section>
      {editingRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Редактирование строки</h3>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-md border px-2 py-1 text-sm"
                disabled={editSaving}
              >
                Закрыть
              </button>
            </div>
            <form className="space-y-3" onSubmit={submitEdit}>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Наименование"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Артикул"
                value={editArticle}
                onChange={(event) => setEditArticle(event.target.value)}
                required
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Количество"
                value={editQuantity}
                onChange={(event) => setEditQuantity(event.target.value)}
                required
              />
              <button
                type="submit"
                className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={editSaving}
              >
                {editSaving ? "Сохранение..." : "Сохранить"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
