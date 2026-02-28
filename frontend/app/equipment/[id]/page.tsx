"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import AppNavbar from "@/components/app-navbar";
import { getApiUrl } from "@/lib/auth";
import { formatDateTimeAlmaty } from "@/lib/datetime";

type UnknownRecord = Record<string, unknown>;

type UserOption = {
  id: string;
  label: string;
};

type DocumentRow = {
  id: string;
  name: string;
  url: string;
  size: string;
  updatedAt: string;
};

type ProgramItem = {
  id: string;
  recordKey: string;
  title: string;
  activities: string[];
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
  documents: DocumentRow[];
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

function toFileUrl(url: string) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${getApiUrl()}${url}`;
}

function toFileSizeLabel(value: string) {
  const sizeMb = Number(value);
  if (!Number.isFinite(sizeMb) || sizeMb <= 0) return "—";
  if (sizeMb >= 10) return `${sizeMb.toFixed(1)} MB`;
  return `${sizeMb.toFixed(2)} MB`;
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
  const [documentUploadError, setDocumentUploadError] = useState("");
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentDeletingId, setDocumentDeletingId] = useState("");
  const [documentInputKey, setDocumentInputKey] = useState(0);
  const [currentUserId, setCurrentUserId] = useState("");
  const [programs, setPrograms] = useState<ProgramItem[]>([]);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [programMenuId, setProgramMenuId] = useState<string | null>(null);
  const [programEditModeId, setProgramEditModeId] = useState<string | null>(null);
  const [programTitle, setProgramTitle] = useState("");
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programsError, setProgramsError] = useState("");
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityProgramId, setActivityProgramId] = useState("");
  const [activityValue, setActivityValue] = useState("");
  const [actSavingProgramId, setActSavingProgramId] = useState("");
  const [showActModal, setShowActModal] = useState(false);
  const [actProgramId, setActProgramId] = useState("");
  const [actImages, setActImages] = useState<File[]>([]);

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
        let documents: DocumentRow[] = [];
        let movements: EquipmentDetails["movements"] = [];

        const equipmentLookupId = equipmentDocumentId || equipmentId;
        if (equipmentLookupId) {
          const documentsResponse = await fetch(
            `${getApiUrl()}/api/equipments/${equipmentLookupId}?populate[0]=documents`,
            { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
          );

          if (documentsResponse.ok) {
            const documentsPayload = (await documentsResponse.json()) as
              | { data?: UnknownRecord }
              | UnknownRecord;
            const equipmentWithDocs = unwrapOne(
              "data" in (documentsPayload as UnknownRecord)
                ? (documentsPayload as { data?: UnknownRecord }).data
                : documentsPayload
            );
            documents = getItems(getObject(equipmentWithDocs, "documents")).map((file) => {
              const fileUrl = getText(file, "url");
              return {
                id: getText(file, "id") || getText(file, "documentId") || fileUrl,
                name: getText(file, "name") || "Файл",
                url: toFileUrl(fileUrl),
                size: toFileSizeLabel(getText(file, "size")),
                updatedAt: getText(file, "updatedAt") || getText(file, "createdAt"),
              };
            });
          }
        }

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
          documents,
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

  const maintenanceEquipmentKey = useMemo(() => {
    if (!data) return "";
    return data.equipmentDocumentId || data.equipmentId || data.inventoryId;
  }, [data]);

  const maintenancePrograms = useMemo(() => {
    return [...programs].sort((a, b) => a.title.localeCompare(b.title));
  }, [programs]);

  useEffect(() => {
    async function loadPrograms() {
      if (!data || data.category !== "Оборудование") {
        setPrograms([]);
        return;
      }

      const token = localStorage.getItem("token");
      if (!token) {
        setPrograms([]);
        return;
      }

      const equipmentFilterKey = data.equipmentDocumentId || data.equipmentId;
      if (!equipmentFilterKey) {
        setPrograms([]);
        return;
      }

      setProgramsLoading(true);
      setProgramsError("");
      try {
        const params = new URLSearchParams();
        if (data.equipmentDocumentId) {
          params.append("filters[equipment][documentId][$eq]", data.equipmentDocumentId);
        } else {
          params.append("filters[equipment][id][$eq]", data.equipmentId);
        }
        params.append("sort[0]", "title:asc");

        const response = await fetch(
          `${getApiUrl()}/api/maintenance-programs?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) {
          throw new Error("Не удалось загрузить программы ТО");
        }

        const payload = await response.json();
        const rows = getItems(payload).map((row) => {
          const rawActivities = row.activities;
          const activities = Array.isArray(rawActivities)
            ? rawActivities.map((value) => String(value).trim()).filter(Boolean)
            : [];

          const id = getText(row, "id");
          const documentId = getText(row, "documentId");
          return {
            id: documentId || id,
            recordKey: documentId || id,
            title: getText(row, "title") || "Программа ТО",
            activities,
          } as ProgramItem;
        });

        setPrograms(rows.filter((item) => item.recordKey));
      } catch (loadError) {
        setPrograms([]);
        setProgramsError(
          loadError instanceof Error ? loadError.message : "Ошибка загрузки программ ТО"
        );
      } finally {
        setProgramsLoading(false);
      }
    }

    loadPrograms();
  }, [data]);

  function resetProgramForm() {
    setProgramTitle("");
  }

  function openCreateProgramModal() {
    resetProgramForm();
    setShowProgramModal(true);
  }

  function closeProgramModal() {
    setShowProgramModal(false);
    resetProgramForm();
  }

  async function saveProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!maintenanceEquipmentKey || !data) return;

    const title = programTitle.trim();
    if (!title) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/maintenance-programs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            title,
            equipment: Number(data.equipmentId),
            activities: [],
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось создать программу ТО");
      }

      const payload = await response.json();
      const entry = unwrapOne(
        "data" in (payload as UnknownRecord)
          ? (payload as { data?: UnknownRecord }).data
          : (payload as UnknownRecord)
      );
      const id = getText(entry, "id");
      const documentId = getText(entry, "documentId");
      const created: ProgramItem = {
        id: documentId || id,
        recordKey: documentId || id,
        title: getText(entry, "title") || title,
        activities: [],
      };

      setPrograms((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title)));
      closeProgramModal();
    } catch (saveError) {
      setProgramsError(saveError instanceof Error ? saveError.message : "Ошибка создания программы ТО");
    }
  }

  async function deleteProgram(program: ProgramItem) {
    const confirmed = window.confirm("Удалить таблицу программы ТО?");
    if (!confirmed) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/maintenance-programs/${program.recordKey}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Не удалось удалить программу ТО");
      }
      setPrograms((prev) => prev.filter((item) => item.id !== program.id));
      setProgramEditModeId((prev) => (prev === program.id ? null : prev));
      setProgramMenuId(null);
    } catch (deleteError) {
      setProgramsError(
        deleteError instanceof Error ? deleteError.message : "Ошибка удаления программы ТО"
      );
    }
  }

  async function updateProgramActivities(program: ProgramItem, activities: string[]) {
    const token = localStorage.getItem("token");
    if (!token) return false;

    const nextActivities = activities.map((value) => value.trim()).filter(Boolean);
    try {
      const response = await fetch(`${getApiUrl()}/api/maintenance-programs/${program.recordKey}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          data: {
            activities: nextActivities,
          },
        }),
      });
      if (!response.ok) {
        throw new Error("Не удалось обновить мероприятия");
      }
      setPrograms((prev) =>
        prev.map((item) => (item.id === program.id ? { ...item, activities: nextActivities } : item))
      );
      return true;
    } catch (updateError) {
      setProgramsError(
        updateError instanceof Error ? updateError.message : "Ошибка обновления мероприятий"
      );
      return false;
    }
  }

  function openAddActivityModal(program: ProgramItem) {
    setActivityProgramId(program.id);
    setActivityValue("");
    setShowActivityModal(true);
  }

  function closeAddActivityModal() {
    setShowActivityModal(false);
    setActivityProgramId("");
    setActivityValue("");
  }

  async function submitAddActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = activityValue.trim();
    if (!value) return;
    const targetProgram = maintenancePrograms.find((program) => program.id === activityProgramId);
    if (!targetProgram) return;

    const ok = await updateProgramActivities(targetProgram, [...targetProgram.activities, value]);
    if (ok) closeAddActivityModal();
  }

  function openActModal(program: ProgramItem) {
    setActProgramId(program.id);
    setActImages([]);
    setShowActModal(true);
    setProgramMenuId(null);
  }

  function closeActModal() {
    if (actSavingProgramId) return;
    setShowActModal(false);
    setActProgramId("");
    setActImages([]);
  }

  function onActImagesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    setActImages(files);
  }

  async function readAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      reader.readAsDataURL(file);
    });
  }

  async function submitAct() {
    const targetProgram = maintenancePrograms.find((program) => program.id === actProgramId);
    if (!targetProgram) return;
    await buildAct(targetProgram, actImages);
  }

  async function buildAct(program: ProgramItem, imageFiles: File[] = []) {
    if (!data) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    setActSavingProgramId(program.id);
    setProgramMenuId(null);
    setDocumentUploadError("");

    try {
      const equipmentLabel = data.name || "Оборудование";
      const actDate = new Date().toLocaleDateString("ru-RU");
      const activitiesHtml =
        program.activities.length > 0
          ? `<ol>${program.activities
              .map((activity) => `<li>${activity.replaceAll("<", "&lt;")}</li>`)
              .join("")}</ol>`
          : "<p>—</p>";
      const imageDataUrls = await Promise.all(imageFiles.map((file) => readAsDataUrl(file)));
      const imagesHtml =
        imageDataUrls.length > 0
          ? `<p class="gap"><strong>Фото:</strong></p>
             ${imageDataUrls
               .map(
                 (url, index) =>
                   `<p style="margin: 8px 0;"><img src="${url}" alt="Фото ${index + 1}" style="max-width: 100%; max-height: 420px;" /></p>`
               )
               .join("")}`
          : "";

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Акт ТО</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.4; }
    h1 { font-size: 16pt; margin-bottom: 8px; text-align: center; }
    p { margin: 6px 0; }
    .gap { margin-top: 14px; }
    table.sign-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    table.sign-table td { vertical-align: bottom; height: 30px; }
    table.sign-table td.label { width: 120px; }
    table.sign-table td.line { border-bottom: 1px solid #000; }
  </style>
</head>
<body>
  <h1>АКТ ВЫПОЛНЕНИЯ ТО</h1>
  <p><strong>Дата:</strong> ${actDate}</p>
  <p><strong>Программа:</strong> ${program.title}</p>
  <p><strong>Оборудование:</strong> ${equipmentLabel}</p>
  <p class="gap"><strong>Мероприятия:</strong></p>
  ${activitiesHtml}
  ${imagesHtml}
  <table class="sign-table">
    <tr>
      <td class="label"><strong>Результат:</strong></td>
      <td class="line"></td>
    </tr>
    <tr>
      <td class="line"></td>
      <td class="line"></td>
    </tr>
    <tr>
      <td class="label"><strong>Комментарий:</strong></td>
      <td class="line"></td>
    </tr>
    <tr>
      <td class="line"></td>
      <td class="line"></td>
    </tr>
    <tr>
      <td class="label"><strong>Выполнил:</strong></td>
      <td class="line"></td>
    </tr>
    <tr>
      <td class="label"><strong>Утвердил:</strong></td>
      <td class="line"></td>
    </tr>
  </table>
</body>
</html>`;

      const blob = new Blob([html], { type: "application/msword" });
      const fileDate = new Date().toLocaleDateString("ru-RU");
      const fileBaseTitle = (program.title || "акт")
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const fileName = `${fileBaseTitle} ${fileDate}.doc`;
      const file = new File([blob], fileName, { type: "application/msword" });

      const uploadOnce = async (refId: string) => {
        const formData = new FormData();
        formData.append("files", file);
        formData.append("ref", "api::equipment.equipment");
        formData.append("refId", refId);
        formData.append("field", "documents");

        return fetch(`${getApiUrl()}/api/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
      };

      let response = await uploadOnce(data.equipmentDocumentId || data.equipmentId);
      if (!response.ok && data.equipmentDocumentId && data.equipmentId) {
        response = await uploadOnce(data.equipmentId);
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось сохранить акт в документы");
      }

      const payload = (await response.json()) as unknown;
      const uploadedRows = (Array.isArray(payload) ? payload : []).map((fileRow) => {
        const entry = fileRow as UnknownRecord;
        const fileUrl = getText(entry, "url");
        return {
          id: getText(entry, "id") || getText(entry, "documentId") || fileUrl,
          name: getText(entry, "name") || "Файл",
          url: toFileUrl(fileUrl),
          size: toFileSizeLabel(getText(entry, "size")),
          updatedAt: getText(entry, "updatedAt") || getText(entry, "createdAt"),
        };
      });

      if (uploadedRows.length > 0) {
        setData((prev) => {
          if (!prev) return prev;
          const next = [...uploadedRows, ...prev.documents];
          const seen = new Set<string>();
          return {
            ...prev,
            documents: next.filter((row) => {
              if (!row.id || seen.has(row.id)) return false;
              seen.add(row.id);
              return true;
            }),
          };
        });
      }
      closeActModal();
    } catch (actError) {
      setDocumentUploadError(
        actError instanceof Error ? actError.message : "Ошибка формирования акта"
      );
    } finally {
      setActSavingProgramId("");
    }
  }

  async function editActivity(programId: string, index: number) {
    const targetProgram = maintenancePrograms.find((program) => program.id === programId);
    const currentValue = targetProgram?.activities[index] || "";
    const value = window.prompt("Изменить мероприятие", currentValue);
    if (value === null) return;
    const nextValue = value.trim();
    if (!nextValue || !targetProgram) return;

    const nextActivities = [...targetProgram.activities];
    nextActivities[index] = nextValue;
    await updateProgramActivities(targetProgram, nextActivities);
  }

  async function deleteActivity(programId: string, index: number) {
    const confirmed = window.confirm("Удалить мероприятие?");
    if (!confirmed) return;
    const targetProgram = maintenancePrograms.find((program) => program.id === programId);
    if (!targetProgram) return;
    const nextActivities = targetProgram.activities.filter((_, activityIndex) => activityIndex !== index);
    await updateProgramActivities(targetProgram, nextActivities);
  }

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

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    if (!data) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setDocumentUploading(true);
    setDocumentUploadError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Сессия не найдена");
      }

      const uploadOnce = async (refId: string) => {
        const formData = new FormData();
        formData.append("files", file);
        formData.append("ref", "api::equipment.equipment");
        formData.append("refId", refId);
        formData.append("field", "documents");

        return fetch(`${getApiUrl()}/api/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
      };

      let response = await uploadOnce(data.equipmentDocumentId || data.equipmentId);
      if (!response.ok && data.equipmentDocumentId && data.equipmentId) {
        response = await uploadOnce(data.equipmentId);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось загрузить документ");
      }

      const payload = (await response.json()) as unknown;
      const uploadedRows = (Array.isArray(payload) ? payload : []).map((fileRow) => {
        const entry = fileRow as UnknownRecord;
        const fileUrl = getText(entry, "url");
        return {
          id: getText(entry, "id") || getText(entry, "documentId") || fileUrl,
          name: getText(entry, "name") || "Файл",
          url: toFileUrl(fileUrl),
          size: toFileSizeLabel(getText(entry, "size")),
          updatedAt: getText(entry, "updatedAt") || getText(entry, "createdAt"),
        };
      });

      if (uploadedRows.length > 0) {
        setData((prev) => {
          if (!prev) return prev;
          const next = [...uploadedRows, ...prev.documents];
          const seen = new Set<string>();
          return {
            ...prev,
            documents: next.filter((row) => {
              if (!row.id || seen.has(row.id)) return false;
              seen.add(row.id);
              return true;
            }),
          };
        });
      }
    } catch (uploadError) {
      setDocumentUploadError(
        uploadError instanceof Error ? uploadError.message : "Ошибка загрузки документа"
      );
    } finally {
      setDocumentUploading(false);
      setDocumentInputKey((prev) => prev + 1);
    }
  }

  async function deleteDocument(documentId: string) {
    const numericId = Number(documentId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setDocumentUploadError("Не удалось удалить документ: некорректный id файла");
      return;
    }

    const confirmed = window.confirm("Удалить документ? Это действие нельзя отменить.");
    if (!confirmed) return;

    setDocumentDeletingId(documentId);
    setDocumentUploadError("");

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Сессия не найдена");
      }

      const response = await fetch(`${getApiUrl()}/api/upload/files/${numericId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось удалить документ");
      }

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          documents: prev.documents.filter((row) => row.id !== documentId),
        };
      });
    } catch (deleteError) {
      setDocumentUploadError(
        deleteError instanceof Error ? deleteError.message : "Ошибка удаления документа"
      );
    } finally {
      setDocumentDeletingId("");
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

              {data.category === "Оборудование" ? (
                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Программа ТО</h3>
                    <button
                      type="button"
                      className="rounded-md bg-black px-3 py-2 text-sm text-white"
                      onClick={openCreateProgramModal}
                    >
                      Добавить программу
                    </button>
                  </div>
                  <div className="mt-3 space-y-4">
                    {programsLoading ? (
                      <p className="text-sm text-zinc-500">Загрузка программ ТО...</p>
                    ) : null}
                    {programsError ? (
                      <p className="text-sm text-red-600">{programsError}</p>
                    ) : null}
                    {maintenancePrograms.length === 0 ? (
                      <div className="rounded-lg border bg-white p-4 text-sm text-zinc-600">
                        Программы ТО для этого оборудования пока не добавлены.
                      </div>
                    ) : (
                      maintenancePrograms.map((program) => (
                        <div key={program.id} className="overflow-hidden rounded-lg border">
                          <div className="flex items-center justify-between border-b px-4 py-3">
                            <h4 className="font-medium">{program.title}</h4>
                            <div className="relative">
                              <button
                                type="button"
                                className="rounded-md border px-3 py-1.5 text-sm"
                                onClick={() =>
                                  setProgramMenuId((prev) => (prev === program.id ? null : program.id))
                                }
                              >
                                Действия
                              </button>
                              {programMenuId === program.id ? (
                                <div className="absolute right-0 z-10 mt-2 w-48 rounded-md border bg-white p-1 shadow">
                                  <button
                                    type="button"
                                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100"
                                    onClick={() => {
                                      setProgramEditModeId((prev) =>
                                        prev === program.id ? null : program.id
                                      );
                                      setProgramMenuId(null);
                                    }}
                                  >
                                    Редактировать
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100"
                                    onClick={() => openActModal(program)}
                                    disabled={actSavingProgramId === program.id}
                                  >
                                    {actSavingProgramId === program.id
                                      ? "Сохранение акта..."
                                      : "Сформировать акт"}
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                                    onClick={() => deleteProgram(program)}
                                  >
                                    Удалить таблицу
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-zinc-100 text-zinc-700">
                                <tr>
                                  <th className="px-4 py-2 text-left">Мероприятия</th>
                                  {programEditModeId === program.id ? (
                                    <th className="px-4 py-2 text-left">Действия</th>
                                  ) : null}
                                </tr>
                              </thead>
                              <tbody>
                                {program.activities.map((activity, index) => (
                                  <tr key={`${program.id}-${index}`} className="border-t">
                                    <td className="px-4 py-2">{activity}</td>
                                    {programEditModeId === program.id ? (
                                      <td className="px-4 py-2">
                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            type="button"
                                            className="rounded-md border px-2 py-1 text-xs hover:bg-zinc-100"
                                            onClick={() => editActivity(program.id, index)}
                                          >
                                            Изменить
                                          </button>
                                          <button
                                            type="button"
                                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                                            onClick={() => deleteActivity(program.id, index)}
                                          >
                                            Удалить
                                          </button>
                                        </div>
                                      </td>
                                    ) : null}
                                  </tr>
                                ))}
                                {program.activities.length === 0 ? (
                                  <tr className="border-t">
                                    <td
                                      className="px-4 py-2 text-zinc-500"
                                      colSpan={programEditModeId === program.id ? 2 : 1}
                                    >
                                      Мероприятия не добавлены
                                    </td>
                                  </tr>
                                ) : null}
                                <tr className="border-t">
                                  <td className="px-4 py-2">
                                    <button
                                      type="button"
                                      className="rounded-md border border-dashed px-3 py-1.5 text-sm hover:bg-zinc-50"
                                      onClick={() => openAddActivityModal(program)}
                                    >
                                      + Добавить мероприятие
                                    </button>
                                  </td>
                                  {programEditModeId === program.id ? <td className="px-4 py-2" /> : null}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {data.category === "Оборудование" ? (
                <div className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">Документы</h3>
                    <label className="cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-zinc-100">
                      <input
                        key={documentInputKey}
                        type="file"
                        className="hidden"
                        onChange={uploadDocument}
                        disabled={documentUploading}
                      />
                      {documentUploading ? "Загрузка..." : "Добавить документ"}
                    </label>
                  </div>
                  {documentUploadError ? (
                    <p className="mt-2 text-sm text-red-600">{documentUploadError}</p>
                  ) : null}
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="px-2 py-2">Название файла</th>
                          <th className="px-2 py-2">Размер</th>
                          <th className="px-2 py-2">Обновлено</th>
                          <th className="px-2 py-2">Действие</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.documents.map((document) => (
                          <tr key={document.id} className="border-b">
                            <td className="px-2 py-2">{document.name}</td>
                            <td className="px-2 py-2">{document.size}</td>
                            <td className="px-2 py-2">{formatDateTimeAlmaty(document.updatedAt)}</td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-2">
                                {document.url ? (
                                  <a
                                    href={document.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-md border px-2 py-1 text-sm hover:bg-zinc-100"
                                    download
                                  >
                                    Скачать
                                  </a>
                                ) : (
                                  <span>—</span>
                                )}
                                <button
                                  type="button"
                                  className="rounded-md border border-red-200 px-2 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                                  onClick={() => deleteDocument(document.id)}
                                  disabled={documentDeletingId === document.id}
                                >
                                  {documentDeletingId === document.id ? "Удаление..." : "Удалить"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {data.documents.length === 0 ? (
                          <tr>
                            <td className="px-2 py-2 text-zinc-500" colSpan={4}>
                              Документы не добавлены
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

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
      {showProgramModal && data && data.category === "Оборудование" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Добавить программу ТО</h3>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={closeProgramModal}
              >
                Закрыть
              </button>
            </div>
            <form className="space-y-3" onSubmit={saveProgram}>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Название программы"
                value={programTitle}
                onChange={(event) => setProgramTitle(event.target.value)}
                required
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={data.name || ""}
                readOnly
              />
              <button type="submit" className="w-full rounded-md bg-black px-4 py-2 text-sm text-white">
                Добавить
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {showActivityModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Добавить мероприятие</h3>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={closeAddActivityModal}
              >
                Закрыть
              </button>
            </div>
            <form className="space-y-3" onSubmit={submitAddActivity}>
              <textarea
                className="w-full rounded-md border px-3 py-2 text-sm"
                rows={4}
                placeholder="Текст мероприятия"
                value={activityValue}
                onChange={(event) => setActivityValue(event.target.value)}
                required
              />
              <button type="submit" className="w-full rounded-md bg-black px-4 py-2 text-sm text-white">
                Добавить
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {showActModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Сформировать акт</h3>
              <button
                type="button"
                className="rounded-md border px-2 py-1 text-sm"
                onClick={closeActModal}
                disabled={Boolean(actSavingProgramId)}
              >
                Закрыть
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">
                Можно добавить изображения в акт (необязательно).
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onActImagesChange}
                className="block w-full rounded-md border px-3 py-2 text-sm"
                disabled={Boolean(actSavingProgramId)}
              />
              <p className="text-xs text-zinc-500">
                Выбрано файлов: {actImages.length}
              </p>
              <button
                type="button"
                className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={submitAct}
                disabled={Boolean(actSavingProgramId)}
              >
                {actSavingProgramId ? "Сохранение акта..." : "Сформировать и сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
