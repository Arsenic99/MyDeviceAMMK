const USER_UID = "plugin::users-permissions.user";

const ALLOWED_FIELDS = [
  "firstName",
  "lastName",
  "position",
  "department",
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

function pickProfile(data: Record<string, unknown>) {
  const profile: Record<AllowedField, string> = {
    firstName: "",
    lastName: "",
    position: "",
    department: "",
  };

  for (const key of ALLOWED_FIELDS) {
    const raw = data[key];
    profile[key] = typeof raw === "string" ? raw : "";
  }

  return profile;
}

function normalizeInput(input: Record<string, unknown>) {
  const normalized: Partial<Record<AllowedField, string>> = {};
  for (const key of ALLOWED_FIELDS) {
    const value = input[key];
    normalized[key] = typeof value === "string" ? value.trim() : "";
  }
  return normalized;
}

export default {
  async me(ctx) {
    const currentUserId = Number(ctx.state.user?.id);
    if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
      return ctx.unauthorized("Пользователь не авторизован");
    }

    const user = await strapi.db.query(USER_UID).findOne({
      where: { id: currentUserId },
    });

    if (!user) {
      return ctx.notFound("Пользователь не найден");
    }

    return {
      data: {
        id: user.id,
        ...pickProfile(user as Record<string, unknown>),
      },
    };
  },

  async updateMe(ctx) {
    const currentUserId = Number(ctx.state.user?.id);
    if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
      return ctx.unauthorized("Пользователь не авторизован");
    }

    const body = (ctx.request.body ?? {}) as { data?: Record<string, unknown> };
    const input = body.data ?? {};
    const nextData = normalizeInput(input);

    const updated = await strapi.db.query(USER_UID).update({
      where: { id: currentUserId },
      data: nextData,
    });

    return {
      data: {
        id: updated.id,
        ...pickProfile(updated as Record<string, unknown>),
      },
    };
  },
};
