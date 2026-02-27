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

function withTrx<T extends Record<string, unknown>>(params: T, trx?: any): T {
  if (!trx) return params;
  return { ...params, transacting: trx };
}

export default factories.createCoreController(
  MOVEMENT_UID,
  ({ strapi }) => {
    const getInventoryRows = async (
      equipmentId: number,
      userId: number,
      trx?: any
    ) =>
      strapi.db.query(INVENTORY_UID).findMany(
        withTrx(
          {
            where: {
              equipment: equipmentId,
              users_permissions_user: userId,
            },
            orderBy: { id: 'asc' },
          },
          trx
        )
      );

    const setQuantity = async ({
      equipmentId,
      userId,
      nextQuantity,
      trx,
    }: {
      equipmentId: number;
      userId: number;
      nextQuantity: number;
      trx?: any;
    }) => {
      const rows = await getInventoryRows(equipmentId, userId, trx);
      const primary = rows[0];

      if (primary) {
        await strapi.db.query(INVENTORY_UID).update(
          withTrx(
            {
              where: { id: primary.id },
              data: { quantity: nextQuantity },
            },
            trx
          )
        );

        if (rows.length > 1) {
          await Promise.all(
            rows.slice(1).map((row) =>
              strapi.db.query(INVENTORY_UID).delete(
                withTrx(
                  {
                    where: { id: row.id },
                  },
                  trx
                )
              )
            )
          );
        }

        return;
      }

      await strapi.db.query(INVENTORY_UID).create(
        withTrx(
          {
            data: {
              equipment: equipmentId,
              users_permissions_user: userId,
              quantity: nextQuantity,
            },
          },
          trx
        )
      );
    };

    const applyStockChange = async ({
      equipmentId,
      operationType,
      quantity,
      fromUserId,
      toUserId,
      trx,
    }: {
      equipmentId: number;
      operationType: string;
      quantity: number;
      fromUserId: number;
      toUserId: number;
      trx?: any;
    }) => {
      const decrease = async (userId: number, delta: number) => {
        const rows = await getInventoryRows(equipmentId, userId, trx);
        const currentQty = toNumber(rows[0]?.quantity ?? 0);
        const nextQty = currentQty - delta;
        if (nextQty < 0) {
          return false;
        }
        await setQuantity({ equipmentId, userId, nextQuantity: nextQty, trx });
        return true;
      };

      if (operationType === 'ПРИХОД') {
        const rows = await getInventoryRows(equipmentId, toUserId, trx);
        const currentQty = toNumber(rows[0]?.quantity ?? 0);
        await setQuantity({
          equipmentId,
          userId: toUserId,
          nextQuantity: currentQty + quantity,
          trx,
        });
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
        const rows = await getInventoryRows(equipmentId, toUserId, trx);
        const currentQty = toNumber(rows[0]?.quantity ?? 0);
        await setQuantity({
          equipmentId,
          userId: toUserId,
          nextQuantity: currentQty + quantity,
          trx,
        });
      }
    };

    return {
      async create(ctx) {
        const body = (ctx.request.body ?? {}) as { data?: Record<string, unknown> };
        const data = body.data ?? {};

        const currentUserId = toNumber(ctx.state.user?.id);
        if (!Number.isFinite(currentUserId) || currentUserId <= 0) {
          return ctx.unauthorized('Пользователь не авторизован');
        }

        const currentUser = await getUserById(strapi, currentUserId);
        if (!currentUser?.isResponsiblePerson) {
          return ctx.forbidden('Создавать операции может только МОЛ/ответственный');
        }

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
          if (toUserId !== currentUserId) {
            return ctx.forbidden('Операция за другого пользователя запрещена');
          }
        }

        if (operationType === 'СПИСАНИЕ') {
          if (!Number.isFinite(fromUserId) || fromUserId <= 0) {
            return ctx.badRequest('Для СПИСАНИЕ необходимо указать from_user');
          }
          if (fromUserId !== currentUserId) {
            return ctx.forbidden('Операция за другого пользователя запрещена');
          }
        }

        if (operationType === 'ПЕРЕМЕЩЕНИЕ') {
          if (!Number.isFinite(fromUserId) || fromUserId <= 0) {
            return ctx.badRequest('Для ПЕРЕМЕЩЕНИЕ необходимо указать from_user');
          }
          if (fromUserId !== currentUserId) {
            return ctx.forbidden('Операция за другого пользователя запрещена');
          }
          if (!Number.isFinite(toUserId) || toUserId <= 0) {
            return ctx.badRequest('Для ПЕРЕМЕЩЕНИЕ необходимо указать to_user');
          }
          if (fromUserId === toUserId) {
            return ctx.badRequest('from_user и to_user должны отличаться');
          }
        }

        const trx = await strapi.db.connection.transaction();
        try {
          if (operationType === 'ПРИХОД') {
            await applyStockChange({
              equipmentId,
              operationType,
              quantity,
              fromUserId,
              toUserId,
              trx,
            });
          }

          const movement = await strapi.db.query(MOVEMENT_UID).create(
            withTrx(
              {
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
                  performed_by: currentUserId,
                },
              },
              trx
            )
          );

          await trx.commit();
          return this.transformResponse(movement);
        } catch (error) {
          await trx.rollback();
          return ctx.badRequest(error instanceof Error ? error.message : 'Ошибка движения');
        }
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

      const trx = await strapi.db.connection.transaction();
      try {
        await applyStockChange({
          equipmentId,
          operationType: String(movement.operationType),
          quantity,
          fromUserId,
          toUserId,
          trx,
        });

        const updated = await strapi.db.query(MOVEMENT_UID).update(
          withTrx(
            {
              where: { id: movementId },
              data: {
                status: 'COMPLETED',
                managerApprovedAt: new Date().toISOString(),
              },
            },
            trx
          )
        );

        await trx.commit();
        return this.transformResponse(updated);
      } catch (error) {
        await trx.rollback();
        return ctx.badRequest(error instanceof Error ? error.message : 'Ошибка движения');
      }
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
