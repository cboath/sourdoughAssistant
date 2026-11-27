export const notificationKeys = {
  all: ['notifications'] as const,
  firstStep: (bakeId: string) => ['notifications', 'firstStep', bakeId] as const,
};
