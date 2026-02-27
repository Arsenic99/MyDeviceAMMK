export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register() {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    try {
      await strapi.db.connection.raw(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'inventories'
          ) AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'inventories'
              AND column_name = 'equipment_id'
          ) AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'inventories'
              AND column_name = 'users_permissions_user_id'
          ) THEN
            CREATE INDEX IF NOT EXISTS inventories_equipment_idx ON inventories (equipment_id);
            CREATE INDEX IF NOT EXISTS inventories_user_idx ON inventories (users_permissions_user_id);
            BEGIN
              CREATE UNIQUE INDEX IF NOT EXISTS inventories_equipment_user_uidx
                ON inventories (equipment_id, users_permissions_user_id);
            EXCEPTION
              WHEN others THEN
                -- Existing duplicates can prevent creating the unique index.
                NULL;
            END;
          END IF;
        END $$;
      `);
    } catch (error) {
      strapi.log.warn(
        `[bootstrap] inventory indexes were not created: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
    }
  },
};
