/**
 * minimal-part controller
 */

import { factories } from '@strapi/strapi';

const UID = 'api::minimal-part.minimal-part';

export default factories.createCoreController(UID, ({ strapi }) => ({
  async create(ctx) {
    const data = (ctx.request.body?.data || {}) as Record<string, unknown>;
    const name = String(data.name || '').trim();
    const article = String(data.article || '').trim();

    if (!name || !article) {
      return ctx.badRequest('Укажите наименование и артикул');
    }

    const existing = await strapi.entityService.findMany(UID, {
      fields: ['id', 'name', 'article'],
      filters: {
        $and: [{ name: { $eqi: name } }, { article: { $eqi: article } }],
      },
      limit: 1,
    });

    if (Array.isArray(existing) && existing.length > 0) {
      return ctx.badRequest('Такая строка уже существует');
    }

    ctx.request.body.data = {
      ...data,
      name,
      article,
    };

    return super.create(ctx);
  },

  async update(ctx) {
    const data = (ctx.request.body?.data || {}) as Record<string, unknown>;
    const targetId = String(ctx.params?.id || '');
    if (!targetId) {
      return ctx.badRequest('Не указан id записи');
    }

    const query = strapi.db.query(UID) as {
      findOne: (options: Record<string, unknown>) => Promise<{
        id?: number;
        documentId?: string;
        name?: string;
        article?: string;
      } | null>;
    };

    const isNumericId = /^\d+$/.test(targetId);
    const current = await query.findOne({
      where: isNumericId ? { id: Number(targetId) } : { documentId: targetId },
      select: ['id', 'documentId', 'name', 'article'],
    });

    if (!current) {
      return ctx.notFound('Запись не найдена');
    }

    const name = String(data.name ?? current.name ?? '').trim();
    const article = String(data.article ?? current.article ?? '').trim();

    if (!name || !article) {
      return ctx.badRequest('Укажите наименование и артикул');
    }

    const existing = await strapi.entityService.findMany(UID, {
      fields: ['id', 'name', 'article'],
      filters: {
        $and: [{ name: { $eqi: name } }, { article: { $eqi: article } }],
      },
      limit: 50,
    }) as Array<{ id?: number; documentId?: string }>;

    const duplicate = existing.some((row) => String(row.id || '') !== String(current.id || ''));

    if (duplicate) {
      return ctx.badRequest('Такая строка уже существует');
    }

    ctx.request.body.data = {
      ...data,
      name,
      article,
    };

    return super.update(ctx);
  },
}));
