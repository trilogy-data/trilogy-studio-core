// Helper function to create proper Results objects
export const createResults = (data: any[]): any => ({
  data,
  headers: [],
  toJSON: () => ({ data }),
})
