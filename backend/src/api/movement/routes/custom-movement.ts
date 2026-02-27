export default {
  routes: [
    {
      method: 'POST',
      path: '/movements/:id/approve-recipient',
      handler: 'movement.approveRecipient',
      config: {
        auth: {},
      },
    },
    {
      method: 'POST',
      path: '/movements/:id/approve-manager',
      handler: 'movement.approveManager',
      config: {
        auth: {},
      },
    },
    {
      method: 'POST',
      path: '/movements/:id/reject-manager',
      handler: 'movement.rejectManager',
      config: {
        auth: {},
      },
    },
  ],
};
