/**
 * movement controller
 */

import { factories } from '@strapi/strapi';

const INVENTORY_UID = 'api::inventory.inventory';
const MOVEMENT_UID = 'api::movement.movement';
const USER_UID = 'plugin::users-permissions.user';
const NOTIFICATION_UID = 'api::notification.notification';

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function relationId(value: unknown) {
  if (typeof value === 'number' || typeof value === 'string') {
    return toNumber(value);
  }

  if (value && typeof value === 'object') {
    const asRecord = value as Record<string, unknown>;
    if ('id' in asRecord) {
      return toNumber(asRecord.id);
    }
    if ('data' in asRecord && asRecord.data && typeof asRecord.data === 'object') {
      const nested = asRecord.data as Record<string, unknown>;
      if ('id' in nested) return toNumber(nested.id);
    }
  }

  return NaN;
}

async function getUserById(strapi: any, id: number) {
  return strapi.db.query(USER_UID).findOne({ where: { id } });
}

export default factories.createCoreController(
  MOVEMENT_UID,
  ({ strapi }) => {
    const applyStockChange = async ({
      equipmentId,
      operationType,
      quantity,
      fromUserId,
      toUserId,
    }: {
      equipmentId: number;
      operationType: string;
      quantity: number;
      fromUserId: number;
      toUserId: number;
    }) => {
      const getInventory = async (userId: number) =>
        strapi.db.query(INVENTORY_UID).findOne({
          where: {
            equipment: equipmentId,
            users_permissions_user: userId,
          },
        });

      const setQuantity = async (userId: number, nextQuantity: number) => {
        const existing = await getInventory(userId);
        if (existing) {
          return strapi.db.query(INVENTORY_UID).update({
            where: { id: existing.id },
            data: { quantity: nextQuantity },
          });
        }

        return strapi.db.query(INVENTORY_UID).create({
          data: {
            equipment: equipmentId,
            users_permissions_user: userId,
            quantity: nextQuantity,
          },
        });
      };

      const decrease = async (userId: number, delta: number) => {
        const existing = await getInventory(userId);
        const currentQty = toNumber(existing?.quantity ?? 0);
        const nextQty = currentQty - delta;
        if (nextQty < 0) {
          return false;
        }
        await setQuantity(userId, nextQty);
        return true;
      };

      if (operationType === 'ПРИХОД') {
        const existing = await getInventory(toUserId);
        const currentQty = toNumber(existing?.quantity ?? 0);
        await setQuantity(toUserId, currentQty + quantity);
      }

      if (operationType === 'СПИСАНИЕ') {
        const ok = await decrease(fromUserId, quantity);
        if (!ok) {
          throw new Error('Недостаточно остатка для списания');
        }
      }

      if (operationType === 'ПЕРЕМЕЩЕНИЕ') {
        const ok = await decrease(fromUserId, quantity);
        if (!ok) {
          throw new Error('Недостаточно остатка для перемещения');
        }
        const existing = await getInventory(toUserId);
        const currentQty = toNumber(existing?.quantity ?? 0);
        await setQuantity(toUserId, currentQty + quantity);
      }
    };

    return {
      async create(ctx) {
      const body = (ctx.request.body ?? {}) as { data?: Record<string, unknown> };
      const data = body.data ?? {};

      const operationType = String(data.operationType ?? '');
      const allowedOperationTypes = ['ПРИХОД', 'СПИСАНИЕ', 'ПЕРЕМЕЩЕНИЕ'];
      if (!allowedOperationTypes.includes(operationType)) {
        return ctx.badRequest('operationType должен быть ПРИХОД, СПИСАНИЕ или ПЕРЕМЕЩЕНИЕ');
      }

      const quantity = toNumber(data.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return ctx.badRequest('quantity должен быть положительным числом');
      }

      const equipmentId = toNumber(data.equipment);
      if (!Number.isFinite(equipmentId) || equipmentId <= 0) {
        return ctx.badRequest('equipment обязателен');
      }

      const fromUserId = data.from_user ? toNumber(data.from_user) : NaN;
      const toUserId = data.to_user ? toNumber(data.to_user) : NaN;

      if (operationType === 'ПРИХОД') {
        if (!Number.isFinite(toUserId) || toUserId <= 0) {
          return ctx.badRequest('Для ПРИХОД необходимо указать to_user');
        }
      }

      if (operationType === 'СПИСАНИЕ') {
        if (!Number.isFinite(fromUserId) || fromUserId <= 0) {
          return ctx.badRequest('Для СПИСАНИЕ необходимо указать from_user');
        }
      }

      if (operationType === 'ПЕРЕМЕЩЕНИЕ') {
        if (!Number.isFinite(fromUserId) || fromUserId <= 0) {
          return ctx.badRequest('Для ПЕРЕМЕЩЕНИЕ необходимо указать from_user');
        }
        if (!Number.isFinite(toUserId) || toUserId <= 0) {
          return ctx.badRequest('Для ПЕРЕМЕЩЕНИЕ необходимо указать to_user');
        }
        if (fromUserId === toUserId) {
          return ctx.badRequest('from_user и to_user должны отличаться');
        }
      }
      if (operationType === 'ПРИХОД') {
        try {
          await applyStockChange({
            equipmentId,
            operationType,
            quantity,
            fromUserId,
            toUserId,
          });
        } catch (error) {
          return ctx.badRequest(error instanceof Error ? error.message : 'Ошибка движения');
        }
      }

      const movement = await strapi.db.query(MOVEMENT_UID).create({
        data: {
          operationType,
          quantity,
          note: data.note ?? null,
          movementDate: data.movementDate ?? new Date().toISOString(),
          status:
            operationType === 'ПЕРЕМЕЩЕНИЕ'
              ? 'PENDING_RECIPIENT'
              : operationType === 'СПИСАНИЕ'
                ? 'PENDING_MANAGER'
                : 'COMPLETED',
          equipment: equipmentId,
          from_user: Number.isFinite(fromUserId) ? fromUserId : null,
          to_user: Number.isFinite(toUserId) ? toUserId : null,
          performed_by: ctx.state.user?.id ?? null,
        },
      });

      return this.transformResponse(movement);
    },

      async approveRecipient(ctx) {
      const movementId = toNumber(ctx.params.id);
      if (!Number.isFinite(movementId) || movementId <= 0) {
        return ctx.badRequest('Некорректный id движения');
      }

      const currentUserId = toNumber(ctx.state.user?.id);
      if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
        return ctx.unauthorized('Пользователь не авторизован');
      }

      const movement = await strapi.db.query(MOVEMENT_UID).findOne({
        where: { id: movementId },
        populate: ['to_user'],
      });

      if (!movement) {
        return ctx.notFound('Движение не найдено');
      }

      if (movement.operationType !== 'ПЕРЕМЕЩЕНИЕ') {
        return ctx.badRequest('Согласование доступно только для ПЕРЕМЕЩЕНИЕ');
      }

      if (movement.status !== 'PENDING_RECIPIENT') {
        return ctx.badRequest('Движение не ожидает согласования получателем');
      }

      const movementToUserId = relationId(movement.to_user);
      if (movementToUserId !== currentUserId) {
        return ctx.forbidden('Согласовать может только получатель');
      }

      const updated = await strapi.db.query(MOVEMENT_UID).update({
        where: { id: movementId },
        data: {
          status: 'PENDING_MANAGER',
          recipientApprovedAt: new Date().toISOString(),
        },
      });

      return this.transformResponse(updated);
    },

      async approveManager(ctx) {
      const movementId = toNumber(ctx.params.id);
      if (!Number.isFinite(movementId) || movementId <= 0) {
        return ctx.badRequest('Некорректный id движения');
      }

      const currentUserId = toNumber(ctx.state.user?.id);
      if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
        return ctx.unauthorized('Пользователь не авторизован');
      }

      const currentUser = await getUserById(strapi, currentUserId);
      if (!currentUser?.isManager) {
        return ctx.forbidden('Подтверждать может только менеджер');
      }

      const movement = await strapi.db.query(MOVEMENT_UID).findOne({
        where: { id: movementId },
        populate: ['equipment', 'from_user', 'to_user'],
      });

      if (!movement) {
        return ctx.notFound('Движение не найдено');
      }

      if (!['ПЕРЕМЕЩЕНИЕ', 'СПИСАНИЕ'].includes(String(movement.operationType))) {
        return ctx.badRequest('Утверждение менеджером доступно для ПЕРЕМЕЩЕНИЕ и СПИСАНИЕ');
      }

      if (movement.status !== 'PENDING_MANAGER') {
        return ctx.badRequest('Движение не ожидает утверждения менеджером');
      }

      const equipmentId = relationId(movement.equipment);
      const fromUserId = relationId(movement.from_user);
      const toUserId = relationId(movement.to_user);
      const quantity = toNumber(movement.quantity);

      try {
        await applyStockChange({
          equipmentId,
          operationType: String(movement.operationType),
          quantity,
          fromUserId,
          toUserId,
        });
      } catch (error) {
        return ctx.badRequest(error instanceof Error ? error.message : 'Ошибка движения');
      }

      const updated = await strapi.db.query(MOVEMENT_UID).update({
        where: { id: movementId },
        data: {
          status: 'COMPLETED',
          managerApprovedAt: new Date().toISOString(),
        },
      });

      return this.transformResponse(updated);
      },

      async rejectManager(ctx) {
        const movementId = toNumber(ctx.params.id);
        if (!Number.isFinite(movementId) || movementId <= 0) {
          return ctx.badRequest('Некорректный id движения');
        }

        const currentUserId = toNumber(ctx.state.user?.id);
        if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
          return ctx.unauthorized('Пользователь не авторизован');
        }

        const currentUser = await getUserById(strapi, currentUserId);
        if (!currentUser?.isManager) {
          return ctx.forbidden('Отклонять может только менеджер');
        }

        const movement = await strapi.db.query(MOVEMENT_UID).findOne({
          where: { id: movementId },
          populate: ['equipment', 'performed_by'],
        });
        if (!movement) {
          return ctx.notFound('Движение не найдено');
        }

        if (movement.status !== 'PENDING_MANAGER') {
          return ctx.badRequest('Движение не ожидает утверждения менеджером');
        }

        const body = (ctx.request.body ?? {}) as { data?: Record<string, unknown> };
        const reason = String(body.data?.reason ?? '').trim();
        if (!reason) {
          return ctx.badRequest('Укажите причину отказа');
        }

        const previousNote = String(movement.note ?? '').trim();
        const combinedNote = previousNote
          ? `${previousNote}\n[Отклонено менеджером] ${reason}`
          : `[Отклонено менеджером] ${reason}`;

        const updated = await strapi.db.query(MOVEMENT_UID).update({
          where: { id: movementId },
          data: {
            status: 'REJECTED',
            managerRejectedAt: new Date().toISOString(),
            note: combinedNote,
          },
        });

        if (String(movement.operationType) === 'СПИСАНИЕ') {
          const initiatorId = relationId(movement.performed_by);
          const equipmentName =
            movement.equipment && typeof movement.equipment === 'object'
              ? String((movement.equipment as Record<string, unknown>).name ?? '')
              : '';

          if (Number.isFinite(initiatorId) && initiatorId > 0) {
            await strapi.db.query(NOTIFICATION_UID).create({
              data: {
                type: 'WRITE_OFF_REJECTED',
                isRead: false,
                user: initiatorId,
                movement: movementId,
                message: equipmentName
                  ? `Списание по оборудованию "${equipmentName}" отклонено: ${reason}`
                  : `Списание отклонено: ${reason}`,
              },
            });
          }
        }

        return this.transformResponse(updated);
      },
    };
  }
);
