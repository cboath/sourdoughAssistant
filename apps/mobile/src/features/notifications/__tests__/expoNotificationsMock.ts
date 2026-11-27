/** A factory for `jest.mock('expo-notifications', ...)` shared by the app-project tests. */
export function createExpoNotificationsMock() {
  return {
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getExactAlarmPermissionsAsync: jest.fn(),
    requestExactAlarmPermissionsAsync: jest.fn(),
    getAllScheduledNotificationsAsync: jest.fn(async () => []),
    scheduleNotificationAsync: jest.fn(async () => 'id'),
    cancelScheduledNotificationAsync: jest.fn(async () => undefined),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
    setNotificationChannelAsync: jest.fn(async () => null),
    addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    useLastNotificationResponse: jest.fn(() => undefined),
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    SchedulableTriggerInputTypes: { DATE: 'date' },
    AndroidImportance: { DEFAULT: 3, HIGH: 4 },
    AndroidNotificationVisibility: { UNKNOWN: 0, PUBLIC: 1, PRIVATE: 2, SECRET: 3 },
  };
}
