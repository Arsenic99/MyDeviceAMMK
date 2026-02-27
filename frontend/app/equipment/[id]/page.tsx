"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppNavbar from "@/components/app-navbar";
import { getApiUrl } from "@/lib/auth";

type UnknownRecord = Record<string, unknown>;

type UserOption = {
  id: string;
  label: string;
};

type EquipmentDetails = {
  inventoryId: string;
  equipmentId: string;
  equipmentDocumentId: string;
  name: string;
  article: string;
  description: string;
  quantity: string;
  unit: string;
  category: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
  movements: {
    id: string;
    operationType: string;
    quantity: string;
    fromUser: string;
    toUser: string;
    movementDate: string;
    note: string;
  }[];
};
const ALMATY_TIME_ZONE = "Asia/Almaty";

function unwrapOne(value: unknown): UnknownRecord | null {
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

function getObject(entry: UnknownRecord | null, key: string) {
  if (!entry) return null;
  const direct = entry[key];
  if (direct && typeof direct === "object") return direct;
  const attributes = entry.attributes;
  if (attributes && typeof attributes === "object") {
    const nested = (attributes as UnknownRecord)[key];
    if (nested && typeof nested === "object") return nested;
  }
  return null;
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

function formatDateTimeAlmaty(value: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: ALMATY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export default function EquipmentDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<EquipmentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferUsers, setTransferUsers] = useState<UserOption[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [writeOffQuantity, setWriteOffQuantity] = useState("");
  const [writeOffReason, setWriteOffReason] = useState("");
  const [writeOffSaving, setWriteOffSaving] = useState(false);
  const [writeOffError, setWriteOffError] = useState("");
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalQuantity, setArrivalQuantity] = useState("");
  const [arrivalSaving, setArrivalSaving] = useState(false);
  const [arrivalError, setArrivalError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) {
      setCurrentUserId("");
      return;
    }
    try {
      const currentUser = JSON.parse(rawUser) as { id?: number | string };
      setCurrentUserId(currentUser.id ? String(currentUser.id) : "");
    } catch {
      setCurrentUserId("");
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem("token");
        const rawUser = localStorage.getItem("user");
        const currentUser = rawUser
          ? (JSON.parse(rawUser) as { id?: number | string; username?: string; email?: string })
          : { id: "" };
        const currentUserId = currentUser.id ? String(currentUser.id) : "";

        const inventoryParams = new URLSearchParams();
        inventoryParams.append("populate[0]", "equipment");
        inventoryParams.append("populate[1]", "users_permissions_user");

        let inventory: UnknownRecord | null = null;

        const directResponse = await fetch(
          `${getApiUrl()}/api/inventories/${params.id}?${inventoryParams.toString()}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (directResponse.ok) {
          const directPayload = (await directResponse.json()) as
            | { data?: UnknownRecord }
            | UnknownRecord;
          inventory = unwrapOne(
            "data" in (directPayload as UnknownRecord)
              ? (directPayload as { data?: UnknownRecord }).data
              : directPayload
          );
        } else {
          const fallbackParams = new URLSearchParams();
          fallbackParams.append("filters[id][$eq]", params.id);
          fallbackParams.append("populate[0]", "equipment");
          fallbackParams.append("populate[1]", "users_permissions_user");
          const fallbackResponse = await fetch(
            `${getApiUrl()}/api/inventories?${fallbackParams.toString()}`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} }
          );
          if (fallbackResponse.ok) {
            const fallbackPayload = await fallbackResponse.json();
            inventory = unwrapOne(getItems(fallbackPayload)[0] || null);
          }
        }

        if (!inventory) {
          throw new Error("Не удалось загрузить запись оборудования");
        }

        const equipment = unwrapOne(getObject(inventory, "equipment"));
        const owner = unwrapOne(getObject(inventory, "users_permissions_user"));

        const ownerId = getText(owner, "id");

        const equipmentId = getText(equipment, "id");
        const equipmentDocumentId = getText(equipment, "documentId");
        let movements: EquipmentDetails["movements"] = [];

        if (equipmentDocumentId || equipmentId) {
          const movementParams = new URLSearchParams();
          if (equipmentDocumentId) {
            movementParams.append("filters[equipment][documentId][$eq]", equipmentDocumentId);
          } else if (equipmentId) {
            movementParams.append("filters[equipment][id][$eq]", equipmentId);
          }
          movementParams.append("populate[0]", "from_user");
          movementParams.append("populate[1]", "to_user");
          movementParams.append("sort[0]", "movementDate:desc");

          const movementsResponse = await fetch(
            `${getApiUrl()}/api/movements?${movementParams.toString()}`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} }
          );

          if (movementsResponse.ok) {
            const movementPayload = await movementsResponse.json();
            movements = getItems(movementPayload).map((row) => {
              const fromUser = unwrapOne(getObject(row, "from_user"));
              const toUser = unwrapOne(getObject(row, "to_user"));
              return {
                id: getText(row, "documentId") || getText(row, "id"),
                operationType: getText(row, "operationType"),
                quantity: getText(row, "quantity"),
                fromUser: getText(fromUser, "username") || getText(fromUser, "email"),
                toUser: getText(toUser, "username") || getText(toUser, "email"),
                movementDate: getText(row, "movementDate"),
                note: getText(row, "note"),
              };
            });
          }
        }

        const usersResponse = await fetch(`${getApiUrl()}/api/users?sort[0]=username:asc`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (usersResponse.ok) {
          const usersPayload = (await usersResponse.json()) as UnknownRecord[];
          const allUsers = Array.isArray(usersPayload) ? usersPayload : [];
          const nextUsers = allUsers
            .map((userRow) => ({
              id: getText(userRow, "id"),
              label: getText(userRow, "username") || getText(userRow, "email"),
            }))
            .filter((u) => u.id && u.id !== currentUserId);
          setTransferUsers(nextUsers);
          if (nextUsers.length > 0) {
            setToUserId(nextUsers[0].id);
          }
        }

        setData({
          inventoryId: getText(inventory, "id"),
          equipmentId,
          equipmentDocumentId,
          name: getText(equipment, "name"),
          article: getText(equipment, "article"),
          description: getText(equipment, "description"),
          quantity: getText(inventory, "quantity"),
          unit: getText(equipment, "unit"),
          category: getText(equipment, "category"),
          ownerId,
          ownerName: getText(owner, "username"),
          ownerEmail: getText(owner, "email"),
          createdAt: getText(inventory, "createdAt"),
          updatedAt: getText(inventory, "updatedAt"),
          movements,
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [params.id, router]);

  async function createTransfer() {
    if (!data) return;
    setTransferSaving(true);
    setTransferError("");

    try {
      const token = localStorage.getItem("token");
      const rawUser = localStorage.getItem("user");
      const currentUser = rawUser ? (JSON.parse(rawUser) as { id?: number }) : {};
      const fromUserId = currentUser.id ? String(currentUser.id) : "";
      const qty = Number(transferQuantity);
      const maxQty = Number(data.quantity);
      const canManage = Boolean(fromUserId && data.ownerId && fromUserId === data.ownerId);

      if (!token || !fromUserId) {
        throw new Error("Сессия не найдена");
      }
      if (!canManage) {
        throw new Error("Операция доступна только МОЛ");
      }
      if (!toUserId) {
        throw new Error("Выберите получателя");
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Укажите корректное количество");
      }
      if (Number.isFinite(maxQty) && qty > maxQty) {
        throw new Error("Количество больше текущего остатка");
      }

      const response = await fetch(`${getApiUrl()}/api/movements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            operationType: "ПЕРЕМЕЩЕНИЕ",
            equipment: Number(data.equipmentId),
            from_user: Number(fromUserId),
            to_user: Number(toUserId),
            quantity: qty,
            note: transferNote || undefined,
            movementDate: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось создать перемещение");
      }

      setTransferQuantity("");
      setTransferNote("");
      setShowTransferModal(false);
      router.push("/");
      router.refresh();
    } catch (createError) {
      setTransferError(createError instanceof Error ? createError.message : "Ошибка перемещения");
    } finally {
      setTransferSaving(false);
    }
  }

  async function createWriteOff() {
    if (!data) return;
    setWriteOffSaving(true);
    setWriteOffError("");

    try {
      const token = localStorage.getItem("token");
      const rawUser = localStorage.getItem("user");
      const currentUser = rawUser ? (JSON.parse(rawUser) as { id?: number }) : {};
      const fromUserId = currentUser.id ? String(currentUser.id) : "";
      const qty = Number(writeOffQuantity);
      const maxQty = Number(data.quantity);
      const canManage = Boolean(fromUserId && data.ownerId && fromUserId === data.ownerId);

      if (!token || !fromUserId) {
        throw new Error("Сессия не найдена");
      }
      if (!canManage) {
        throw new Error("Операция доступна только МОЛ");
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Укажите корректное количество");
      }
      if (Number.isFinite(maxQty) && qty > maxQty) {
        throw new Error("Количество больше текущего остатка");
      }
      if (!writeOffReason.trim()) {
        throw new Error("Укажите причину списания");
      }

      const response = await fetch(`${getApiUrl()}/api/movements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            operationType: "СПИСАНИЕ",
            equipment: Number(data.equipmentId),
            from_user: Number(fromUserId),
            quantity: qty,
            note: writeOffReason.trim(),
            movementDate: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось создать списание");
      }

      setWriteOffQuantity("");
      setWriteOffReason("");
      setShowWriteOffModal(false);
      router.push("/");
      router.refresh();
    } catch (createError) {
      setWriteOffError(createError instanceof Error ? createError.message : "Ошибка списания");
    } finally {
      setWriteOffSaving(false);
    }
  }

  async function createArrival() {
    if (!data) return;
    setArrivalSaving(true);
    setArrivalError("");

    try {
      const token = localStorage.getItem("token");
      const rawUser = localStorage.getItem("user");
      const currentUser = rawUser ? (JSON.parse(rawUser) as { id?: number }) : {};
      const toUserId = currentUser.id ? String(currentUser.id) : "";
      const canManage = Boolean(toUserId && data.ownerId && toUserId === data.ownerId);
      const qty = Number(arrivalQuantity);

      if (!token || !toUserId) {
        throw new Error("Сессия не найдена");
      }
      if (!canManage) {
        throw new Error("Операция доступна только МОЛ");
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error("Укажите корректное количество");
      }

      const response = await fetch(`${getApiUrl()}/api/movements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            operationType: "ПРИХОД",
            equipment: Number(data.equipmentId),
            to_user: Number(toUserId),
            quantity: qty,
            movementDate: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось создать приход");
      }

      setArrivalQuantity("");
      setShowArrivalModal(false);
      router.refresh();
    } catch (createError) {
      setArrivalError(createError instanceof Error ? createError.message : "Ошибка прихода");
    } finally {
      setArrivalSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <AppNavbar />
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="rounded-2xl border bg-white p-6">
          <div className="mb-4">
            <Link className="text-sm text-blue-700 hover:underline" href="/equipment">
              ← Назад к списку
            </Link>
          </div>
          {loading ? <p className="text-zinc-600">Загрузка...</p> : null}
          {error ? <p className="text-red-600">{error}</p> : null}
          {!loading && !error && data ? (
            <div className="space-y-6">
              {currentUserId && data.ownerId !== currentUserId ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Режим просмотра: действия доступны только МОЛ.
                </p>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">{data.name || "Оборудование"}</h2>
                  <p className="mt-1 text-zinc-600">Полная информация по выбранной позиции</p>
                </div>
                {currentUserId && data.ownerId === currentUserId ? (
                  <div className="relative">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1 text-xl leading-none hover:bg-zinc-100"
                      onClick={() => setShowActionsMenu((value) => !value)}
                      aria-label="Открыть действия"
                    >
                      ⋮
                    </button>
                    {showActionsMenu ? (
                      <div className="absolute right-0 z-10 mt-2 w-48 rounded-md border bg-white p-2 shadow">
                        <button
                          type="button"
                          className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                          onClick={() => {
                            setShowActionsMenu(false);
                            setArrivalError("");
                            setShowArrivalModal(true);
                          }}
                        >
                          Оприходовать
                        </button>
                        <button
                          type="button"
                          className="mb-1 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                          onClick={() => {
                            setShowActionsMenu(false);
                            setTransferError("");
                            setShowTransferModal(true);
                          }}
                        >
                          Переместить
                        </button>
                        <button
                          type="button"
                          className="mb-1 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                          onClick={() => {
                            setShowActionsMenu(false);
                            setWriteOffError("");
                            setShowWriteOffModal(true);
                          }}
                        >
                          Списать
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2">
                <p><span className="text-zinc-500">Артикул:</span> {data.article || "—"}</p>
                <p><span className="text-zinc-500">Категория:</span> {data.category || "—"}</p>
                <p><span className="text-zinc-500">Количество:</span> {data.quantity || "—"}</p>
                <p><span className="text-zinc-500">Ед. измерения:</span> {data.unit || "—"}</p>
                <p><span className="text-zinc-500">МОЛ:</span> {data.ownerName || data.ownerEmail || "—"}</p>
                <p><span className="text-zinc-500">Создано:</span> {formatDateTimeAlmaty(data.createdAt)}</p>
                <p><span className="text-zinc-500">Обновлено:</span> {formatDateTimeAlmaty(data.updatedAt)}</p>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="text-lg font-semibold">Описание</h3>
                <p className="mt-2 text-sm text-zinc-700">{data.description || "—"}</p>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="text-lg font-semibold">История движений</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-2 py-2">Тип</th>
                        <th className="px-2 py-2">Кол-во</th>
                        <th className="px-2 py-2">От МОЛ</th>
                        <th className="px-2 py-2">К МОЛ</th>
                        <th className="px-2 py-2">Дата</th>
                        <th className="px-2 py-2">Комментарий</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movements.map((movement) => (
                        <tr key={movement.id} className="border-b">
                          <td className="px-2 py-2">{movement.operationType || "—"}</td>
                          <td className="px-2 py-2">{movement.quantity || "—"}</td>
                          <td className="px-2 py-2">{movement.fromUser || "—"}</td>
                          <td className="px-2 py-2">{movement.toUser || "—"}</td>
                          <td className="px-2 py-2">{formatDateTimeAlmaty(movement.movementDate)}</td>
                          <td className="px-2 py-2">{movement.note || "—"}</td>
                        </tr>
                      ))}
                      {data.movements.length === 0 ? (
                        <tr>
                          <td className="px-2 py-2 text-zinc-500" colSpan={6}>
                            Нет движений
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      {showTransferModal && data ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Перемещение оборудования</h3>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setShowTransferModal(false)}
              >
                Закрыть
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">
                Доступно: <span className="font-medium">{data.quantity || "0"}</span> {data.unit}
              </p>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={toUserId}
                onChange={(event) => setToUserId(event.target.value)}
              >
                <option value="">Выберите получателя</option>
                {transferUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label || u.id}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Количество"
                value={transferQuantity}
                onChange={(event) => setTransferQuantity(event.target.value)}
              />
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
                placeholder="Комментарий"
                value={transferNote}
                onChange={(event) => setTransferNote(event.target.value)}
              />
              {transferError ? <p className="text-sm text-red-600">{transferError}</p> : null}
              <button
                type="button"
                className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={transferSaving}
                onClick={createTransfer}
              >
                {transferSaving ? "Сохранение..." : "Создать перемещение"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showWriteOffModal && data ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Списание оборудования</h3>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setShowWriteOffModal(false)}
              >
                Закрыть
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">
                Доступно: <span className="font-medium">{data.quantity || "0"}</span> {data.unit}
              </p>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Количество к списанию"
                value={writeOffQuantity}
                onChange={(event) => setWriteOffQuantity(event.target.value)}
              />
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
                placeholder="Причина списания"
                value={writeOffReason}
                onChange={(event) => setWriteOffReason(event.target.value)}
              />
              {writeOffError ? <p className="text-sm text-red-600">{writeOffError}</p> : null}
              <button
                type="button"
                className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={writeOffSaving}
                onClick={createWriteOff}
              >
                {writeOffSaving ? "Сохранение..." : "Отправить на утверждение"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showArrivalModal && data ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Оприходование</h3>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setShowArrivalModal(false)}
              >
                Закрыть
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Количество к приходу"
                value={arrivalQuantity}
                onChange={(event) => setArrivalQuantity(event.target.value)}
              />
              {arrivalError ? <p className="text-sm text-red-600">{arrivalError}</p> : null}
              <button
                type="button"
                className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={arrivalSaving}
                onClick={createArrival}
              >
                {arrivalSaving ? "Сохранение..." : "Оприходовать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
