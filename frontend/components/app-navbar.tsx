"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getApiUrl } from "@/lib/auth";

type LocalUser = {
  id?: number;
  username?: string;
  email?: string;
  isResponsiblePerson?: boolean;
  isManager?: boolean;
};

type UnknownRecord = Record<string, unknown>;
type ApiErrorPayload = {
  error?: {
    message?: string;
    details?: {
      errors?: Array<{ message?: string }>;
    };
  };
};

function parseUser(rawUser: string | null): LocalUser {
  if (!rawUser) return {};
  try {
    return JSON.parse(rawUser) as LocalUser;
  } catch {
    return {};
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => { };
  }

  const onStorage = () => onStoreChange();
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function getClientUser() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("user");
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

async function readApiErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  const detailed = payload.error?.details?.errors?.[0]?.message;
  const message = payload.error?.message;
  return detailed || message || fallback;
}

export default function AppNavbar() {
  const router = useRouter();
  const userRaw = useSyncExternalStore(subscribe, getClientUser, () => null);
  const user = parseUser(userRaw);
  const username = user.username || user.email || "User";
  const [open, setOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [article, setArticle] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("шт");
  const [category, setCategory] = useState("ТМЦ");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [hasOpenTasks, setHasOpenTasks] = useState(false);

  const loadOpenTasks = useCallback(async () => {
    const token = localStorage.getItem("token");
    const currentUserId = user.id ? String(user.id) : "";
    if (!token || !currentUserId) {
      setHasOpenTasks(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("filters[status][$in][0]", "PENDING_RECIPIENT");
      params.append("filters[status][$in][1]", "PENDING_MANAGER");
      params.append("populate[0]", "to_user");

      const response = await fetch(`${getApiUrl()}/api/movements?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        setHasOpenTasks(false);
        return;
      }

      const payload = await response.json();
      const rows = getItems(payload);

      const hasTasks = rows.some((row) => {
        const status = getText(row, "status");
        if (status === "PENDING_MANAGER") return Boolean(user.isManager);
        if (status !== "PENDING_RECIPIENT") return false;
        const toUser = unwrap(getObject(row, "to_user"));
        const toUserId = getText(toUser, "id");
        return toUserId === currentUserId;
      });

      setHasOpenTasks(hasTasks);
    } catch {
      setHasOpenTasks(false);
    }
  }, [user.id, user.isManager]);

  useEffect(() => {
    loadOpenTasks();
    const intervalId = window.setInterval(loadOpenTasks, 15000);
    return () => window.clearInterval(intervalId);
  }, [loadOpenTasks]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    document.cookie = "token=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/login");
  }

  function closeModal() {
    setShowAddModal(false);
    setName("");
    setArticle("");
    setDescription("");
    setQuantity("");
    setUnit("шт");
    setCategory("ТМЦ");
    setIsSubmitting(false);
    setSubmitError("");
  }

  async function handleCreateEquipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const token = localStorage.getItem("token");
      const userId = user.id ? String(user.id) : "";
      const parsedQty = Number(quantity);
      if (!token || !userId) {
        throw new Error("Сессия не найдена, авторизуйтесь заново");
      }
      if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
        throw new Error("Укажите корректное количество");
      }

      const equipmentResponse = await fetch(`${getApiUrl()}/api/equipments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            name,
            article: article || undefined,
            description: description || undefined,
            unit,
            category,
          },
        }),
      });

      if (!equipmentResponse.ok) {
        throw new Error(await readApiErrorMessage(equipmentResponse, "Не удалось создать оборудование"));
      }

      const equipmentPayload = (await equipmentResponse.json()) as
        | { data?: UnknownRecord }
        | UnknownRecord;
      const equipmentEntry =
        typeof equipmentPayload === "object" &&
        equipmentPayload !== null &&
        "data" in equipmentPayload
          ? ((equipmentPayload as { data?: UnknownRecord }).data ?? null)
          : (equipmentPayload as UnknownRecord);

      const equipmentId = getText(equipmentEntry, "id");
      if (!equipmentId) {
        throw new Error("Не удалось получить id оборудования");
      }

      const arrivalResponse = await fetch(`${getApiUrl()}/api/movements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            operationType: "ПРИХОД",
            equipment: Number(equipmentId),
            to_user: Number(userId),
            quantity: parsedQty,
            movementDate: new Date().toISOString(),
          },
        }),
      });

      if (!arrivalResponse.ok) {
        throw new Error(await readApiErrorMessage(arrivalResponse, "Не удалось зафиксировать приход"));
      }

      closeModal();
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Ошибка создания оборудования");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <Link className="text-sm text-zinc-700" href="/">
            <h1 className="text-xl font-semibold">Automation <br /> department</h1>
          </Link>

          <Link className="text-sm text-zinc-700" href="/equipment">
            Список оборудования
          </Link>
          <Link className="text-sm text-zinc-700" href="/reports">
            Журнал/отчет
          </Link>
        </div>
        <div className="relative">
          <button
            className="relative rounded-md border bg-white px-3 py-2 text-sm"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {username}
            {hasOpenTasks ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white" />
            ) : null}
          </button>
          {open ? (
            <div className="absolute right-0 mt-2 w-56 rounded-md border bg-white p-2 shadow z-10">
              <Link
                className="mb-1 block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                href="/cabinet"
                onClick={() => setOpen(false)}
              >
                Личный кабинет
              </Link>
              {user.isResponsiblePerson ? (
                <button
                  className="mb-1 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                  onClick={() => {
                    setOpen(false);
                    setShowAddModal(true);
                  }}
                  type="button"
                >
                  Добавить оборудование
                </button>
              ) : null}
              <button
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100"
                onClick={logout}
                type="button"
              >
                Выход
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Добавить оборудование</h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border px-2 py-1 text-sm"
              >
                Закрыть
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleCreateEquipment}>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Наименование"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Артикул"
                value={article}
                onChange={(event) => setArticle(event.target.value)}
              />
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Описание"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Кол-во"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                >
                  <option value="шт">шт</option>
                  <option value="кг">кг</option>
                  <option value="т">т</option>
                  <option value="м">м</option>
                  <option value="л">л</option>
                  <option value="м3">м3</option>
                  <option value="рулон">рулон</option>
                  <option value="упаковка">упаковка</option>
                </select>
              </div>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="ТМЦ">ТМЦ</option>
                <option value="ОС">ОС</option>
                <option value="Оборудование">Оборудование</option>
              </select>
              {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
              <button
                className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Сохранение..." : "Сохранить"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
