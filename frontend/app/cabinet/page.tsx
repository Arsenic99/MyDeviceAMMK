"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import AppNavbar from "@/components/app-navbar";
import { getApiUrl } from "@/lib/auth";

type UnknownRecord = Record<string, unknown>;

type TaskRow = {
  id: string;
  numericId: string;
  operationType: string;
  status: string;
  equipment: string;
  quantity: string;
  fromUser: string;
  toUser: string;
  toUserId: string;
  createdBy: string;
  movementDate: string;
};

type NotificationRow = {
  id: string;
  message: string;
  createdAt: string;
  isRead: boolean;
};
const ALMATY_TIME_ZONE = "Asia/Almaty";

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

export default function Home() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [rejectOpenId, setRejectOpenId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const currentUser = (() => {
    if (typeof window === "undefined") return { id: "", isManager: false };
    const raw = localStorage.getItem("user");
    if (!raw) return { id: "", isManager: false };
    try {
      const parsed = JSON.parse(raw) as { id?: number; isManager?: boolean };
      return {
        id: parsed.id ? String(parsed.id) : "",
        isManager: Boolean(parsed.isManager),
      };
    } catch {
      return { id: "", isManager: false };
    }
  })();
  const currentUserId = currentUser.id;

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const params = new URLSearchParams();
      params.append("filters[status][$in][0]", "PENDING_RECIPIENT");
      params.append("filters[status][$in][1]", "PENDING_MANAGER");
      params.append("populate[0]", "equipment");
      params.append("populate[1]", "from_user");
      params.append("populate[2]", "to_user");
      params.append("populate[3]", "performed_by");
      params.append("sort[0]", "movementDate:desc");

      const response = await fetch(`${getApiUrl()}/api/movements?${params.toString()}`, {
        headers,
      });

      if (!response.ok) throw new Error("Не удалось загрузить задачи");

      const notificationsParams = new URLSearchParams();
      notificationsParams.append("filters[user][id][$eq]", currentUserId);
      notificationsParams.append("filters[isRead][$eq]", "false");
      notificationsParams.append("sort[0]", "createdAt:desc");
      const notificationsResponse = await fetch(
        `${getApiUrl()}/api/notifications?${notificationsParams.toString()}`,
        { headers }
      );

      const payload = await response.json();
      const mapped = getItems(payload).map((row) => {
        const equipment = unwrap(getObject(row, "equipment"));
        const fromUser = unwrap(getObject(row, "from_user"));
        const toUser = unwrap(getObject(row, "to_user"));
        const performedBy = unwrap(getObject(row, "performed_by"));
        return {
          id: getText(row, "documentId") || getText(row, "id"),
          numericId: getText(row, "id"),
          operationType: getText(row, "operationType"),
          status: getText(row, "status"),
          equipment: getText(equipment, "name"),
          quantity: getText(row, "quantity"),
          fromUser: getText(fromUser, "username") || getText(fromUser, "email"),
          toUser: getText(toUser, "username") || getText(toUser, "email"),
          toUserId: getText(toUser, "id"),
          createdBy: getText(performedBy, "username") || getText(performedBy, "email"),
          movementDate: getText(row, "movementDate"),
        };
      });

      setRows(mapped);

      if (notificationsResponse.ok) {
        const notificationsPayload = await notificationsResponse.json();
        const mappedNotifications = getItems(notificationsPayload).map((row) => ({
          id: getText(row, "documentId") || getText(row, "id"),
          message: getText(row, "message"),
          createdAt: getText(row, "createdAt"),
          isRead: getText(row, "isRead") === "true",
        }));
        setNotifications(mappedNotifications);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function approveRecipient(id: string) {
    try {
      setActionLoadingId(id);
      setError("");
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Сессия не найдена");
      const response = await fetch(`${getApiUrl()}/api/movements/${id}/approve-recipient`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось согласовать перемещение");
      }
      await loadTasks();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Ошибка согласования");
    } finally {
      setActionLoadingId("");
    }
  }

  async function approveManager(id: string) {
    try {
      setActionLoadingId(id);
      setError("");
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Сессия не найдена");
      const response = await fetch(`${getApiUrl()}/api/movements/${id}/approve-manager`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось утвердить перемещение");
      }
      await loadTasks();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Ошибка утверждения");
    } finally {
      setActionLoadingId("");
    }
  }

  async function rejectManager(id: string) {
    try {
      setActionLoadingId(id);
      setError("");
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Сессия не найдена");
      const response = await fetch(`${getApiUrl()}/api/movements/${id}/reject-manager`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data: { reason: rejectReason } }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось отклонить");
      }
      setRejectOpenId("");
      setRejectReason("");
      await loadTasks();
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "Ошибка отклонения");
    } finally {
      setActionLoadingId("");
    }
  }

  const myTasks = rows.filter((row) => {
    if (row.status === "PENDING_RECIPIENT") {
      return row.toUserId === currentUser.id;
    }
    if (row.status === "PENDING_MANAGER") {
      return currentUser.isManager;
    }
    return false;
  });

  return (
    <main className="min-h-screen bg-zinc-50">
      <AppNavbar />
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="rounded-2xl border bg-white p-8">
          <h2 className="text-3xl font-semibold">Личный кабинет</h2>
          <p className="mt-2 text-zinc-600">Задачи на согласование и утверждение перемещений.</p>
        </div>

        <div className="mt-6 rounded-2xl border bg-white p-6">
          <h3 className="text-xl font-semibold">Мои задачи</h3>
          {loading ? <p className="mt-3 text-zinc-600">Загрузка...</p> : null}
          {error ? <p className="mt-3 text-red-600">{error}</p> : null}
          {!loading && !error ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2">Тип</th>
                    <th className="px-3 py-2">Статус</th>
                    <th className="px-3 py-2">Оборудование</th>
                    <th className="px-3 py-2">Кол-во</th>
                    <th className="px-3 py-2">От МОЛ</th>
                    <th className="px-3 py-2">К МОЛ</th>
                    <th className="px-3 py-2">Инициатор</th>
                    <th className="px-3 py-2">Дата</th>
                    <th className="px-3 py-2">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {myTasks.map((row) => (
                    <Fragment key={row.id}>
                      <tr key={row.id} className="border-b">
                        <td className="px-3 py-2">{row.operationType}</td>
                        <td className="px-3 py-2">{row.status}</td>
                        <td className="px-3 py-2">{row.equipment || "—"}</td>
                        <td className="px-3 py-2">{row.quantity || "—"}</td>
                        <td className="px-3 py-2">{row.fromUser || "—"}</td>
                        <td className="px-3 py-2">{row.toUser || "—"}</td>
                        <td className="px-3 py-2">{row.createdBy || "—"}</td>
                        <td className="px-3 py-2">{formatDateTimeAlmaty(row.movementDate)}</td>
                        <td className="px-3 py-2">
                          {row.status === "PENDING_RECIPIENT" ? (
                            <button
                              type="button"
                              className="rounded-md border px-2 py-1 hover:bg-zinc-100 disabled:opacity-60"
                              onClick={() => approveRecipient(row.numericId)}
                              disabled={actionLoadingId === row.numericId}
                            >
                              Согласовать
                            </button>
                          ) : null}
                          {row.status === "PENDING_MANAGER" ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="rounded-md border px-2 py-1 hover:bg-zinc-100 disabled:opacity-60"
                                onClick={() => approveManager(row.numericId)}
                                disabled={actionLoadingId === row.numericId}
                              >
                                Утвердить
                              </button>
                              <button
                                type="button"
                                className="rounded-md border px-2 py-1 hover:bg-zinc-100 disabled:opacity-60"
                                onClick={() => {
                                  setRejectOpenId(row.numericId);
                                  setRejectReason("");
                                }}
                                disabled={actionLoadingId === row.numericId}
                              >
                                Отказать
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                      {rejectOpenId === row.numericId ? (
                        <tr className="border-b">
                          <td className="px-3 py-2" colSpan={9}>
                            <div className="flex gap-2">
                              <input
                                className="w-full rounded-md border px-3 py-2"
                                placeholder="Причина отказа"
                                value={rejectReason}
                                onChange={(event) => setRejectReason(event.target.value)}
                              />
                              <button
                                type="button"
                                className="rounded-md border px-3 py-2 disabled:opacity-60"
                                onClick={() => rejectManager(row.numericId)}
                                disabled={!rejectReason.trim() || actionLoadingId === row.numericId}
                              >
                                Подтвердить отказ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                  {myTasks.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-zinc-500" colSpan={9}>
                        Нет задач
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl border bg-white p-6">
          <h3 className="text-xl font-semibold">Уведомления</h3>
          <div className="mt-3 space-y-2">
            {notifications.map((item) => (
              <div key={item.id} className="rounded-md border px-3 py-2 text-sm">
                <p>{item.message || "Уведомление"}</p>
                <p className="mt-1 text-xs text-zinc-500">{formatDateTimeAlmaty(item.createdAt)}</p>
              </div>
            ))}
            {notifications.length === 0 ? (
              <p className="text-sm text-zinc-500">Нет новых уведомлений</p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
