export default {
  routes: [
    {
      method: 'GET',
      path: '/minimal-parts',
      handler: 'minimal-part.find',
    },
    {
      method: 'GET',
      path: '/minimal-parts/:id',
      handler: 'minimal-part.findOne',
    },
    {
      method: 'POST',
      path: '/minimal-parts',
      handler: 'minimal-part.create',
    },
    {
      method: 'PUT',
      path: '/minimal-parts/:id',
      handler: 'minimal-part.update',
    },
    {
      method: 'DELETE',
      path: '/minimal-parts/:id',
      handler: 'minimal-part.delete',
    },
  ],
};
