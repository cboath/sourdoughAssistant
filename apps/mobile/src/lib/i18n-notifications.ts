/**
 * Strings for notifications, primers and reminder banners (docs/design/screens-bake.md sections
 * 5 to 7 and 11). Spread into the main table in `i18n.ts`.
 */
export const enNotifications = {
  // Notification content (section 11)
  'notif.start.title': '{step}',
  'notif.start.body': 'Time to start · {recipe}',
  'notif.fold.title': '{step}: fold {n} of {count}',
  'notif.fold.body': '{recipe}',
  'notif.headsup.title': 'In {minutes} min: {step}',
  'notif.headsup.body': '{recipe}',
  'notif.multi.title': '{count} steps now',
  'notif.multi.body': '{list}',
  'notif.multi.item': '{step} ({recipe})',
  'notif.recipeItem': '{recipe} ({letter})',
  'notif.recipeDisambiguated': '{recipe}, ready {dayTime}',
  'notif.topup.title': 'Keep your reminders coming',
  'notif.topup.body': 'Open Sourdough Assistant to keep your bake reminders coming.',
  // Not in the design doc (ADR 0011 section 4 only names the kind): split into title and body to
  // match the other kinds. Provisional until B8 is answered.
  'notif.ready.title': 'Ready to eat',
  'notif.ready.body': '{recipe}',
  // Not in the design doc (DS-04 SET-REMINDERS owns the final wording).
  'notif.test.title': 'Test reminder',
  'notif.test.body': 'Your reminders are working.',

  'channel.steps.name': 'Bake steps',
  'channel.steps.desc': "Alerts when it's time to start a step or a fold.",
  'channel.headsup.name': 'Upcoming step warnings',
  'channel.headsup.desc': 'A heads-up a few minutes before a step starts.',
  'channel.general.name': 'General',
  'channel.general.desc': 'Other messages from Sourdough Assistant.',

  // Primers (sections 5 and 6)
  'perm.scheduled': 'Bake scheduled. First step {dayTime}.',
  'perm.notif.title': 'Get a reminder for every step',
  'perm.notif.body':
    "Sourdough reminds you when it's time to feed, fold, shape and bake, even overnight and with the app closed.",
  'perm.notif.b1': 'Feed, fold and shape reminders',
  'perm.notif.b2': 'Works overnight and when the app is closed',
  'perm.notif.b3': 'A heads-up a few minutes before each step',
  'perm.notif.allow': 'Turn on reminders',
  'perm.notif.later': 'Not now',
  'perm.alarm.title': 'Allow on-time reminders',
  'perm.alarm.body':
    'Android can delay reminders to save battery. Allowing alarms and reminders means each step alerts you within a minute.',
  'perm.alarm.how':
    'On the next screen, turn on Allow setting alarms and reminders, then come back.',
  'perm.alarm.allow': 'Allow on-time reminders',
  'perm.alarm.later': 'Not now',
  'reminders.on': 'Reminders on.',
  'reminders.onTime': 'On-time reminders on.',
  'reminders.set': 'Reminders set.',

  // Banners (section 7)
  'banner.notifOff': "Reminders are off. You won't be alerted when a step starts.",
  'banner.notifOff.action': 'Turn on',
  'banner.alarmOff': 'Reminders may be late. Allow on-time reminders.',
  'banner.alarmOff.action': 'Allow',
  'banner.notifFailed': "Some reminders couldn't be set.",
  'banner.notifFailed.again':
    "Reminders still couldn't be set. Restart your phone, then open the app again.",
  'banner.notifFailed.action': 'Try again',
  'banner.budget':
    'You have a lot of reminders coming up. Open the app at least once a day so later ones get set.',
  'banner.dismissLabel': 'Dismiss reminders warning',
} as const;
