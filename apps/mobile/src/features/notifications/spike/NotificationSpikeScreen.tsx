/**
 * IO-01 spike screen. DEVELOPMENT ONLY: reached through `app/dev-notifications.tsx`, which loads
 * this module only when `__DEV__` is true. English strings are deliberate: this never ships.
 */
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../../lib/logger';
import { Button } from '../../../ui/components/Button';
import { Text } from '../../../ui/components/Text';
import { describeCap, type SpikeLevel } from '../spikeCore';
import {
  cancelSpike,
  installSpikeHandler,
  listPending,
  readPermission,
  registerSpikeCategory,
  requestPermission,
  scheduleSpikeBatch,
  type SpikePermissionInfo,
} from './spikeApi';

const LEVELS: SpikeLevel[] = ['passive', 'active', 'timeSensitive'];
const COUNTS = [1, 5, 30, 62, 70];

export function NotificationSpikeScreen() {
  const insets = useSafeAreaInsets();
  const [perm, setPerm] = useState<SpikePermissionInfo | null>(null);
  const [count, setCount] = useState(5);
  const [level, setLevel] = useState<SpikeLevel>('timeSensitive');
  const [sound, setSound] = useState(true);
  const [withCategory, setWithCategory] = useState(true);
  const [delay, setDelay] = useState(10);
  const [log, setLog] = useState<string[]>([]);

  const say = useCallback((line: string) => setLog((prev) => [line, ...prev].slice(0, 12)), []);

  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      try {
        say(`${label}: ${await fn()}`);
      } catch (error) {
        logger.error('notif.spike.action_failed', error);
        say(`${label}: ERROR ${error instanceof Error ? error.message : 'unknown'}`);
      }
    },
    [say],
  );

  useEffect(() => {
    installSpikeHandler();
    void registerSpikeCategory();
    void readPermission().then(setPerm);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      say(`response action=${response.actionIdentifier}`);
    });
    return () => sub.remove();
  }, [say]);

  const refreshPermission = () =>
    run('permission', async () => {
      const p = await readPermission();
      setPerm(p);
      return JSON.stringify(p);
    });

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        gap: 12,
        paddingTop: insets.top + 16,
        paddingBottom: 48,
      }}
      testID="notification-spike"
    >
      <Text variant="title2" heading>
        Notification spike (IO-01, dev only)
      </Text>
      <Text variant="caption">
        Permission: {perm ? `${perm.state} (canAskAgain ${String(perm.canAskAgain)})` : '...'}
      </Text>
      {perm ? (
        <Text variant="caption">
          alert {String(perm.alert)} · sound {String(perm.sound)} · lock screen{' '}
          {String(perm.lockScreen)} · critical {String(perm.criticalAlerts)}
        </Text>
      ) : null}
      <Button label="Refresh permission" variant="outline" onPress={refreshPermission} />
      <Button
        label="Request permission (alert, sound)"
        onPress={() =>
          run('request', async () => {
            const p = await requestPermission(false);
            setPerm(p);
            return p.state;
          })
        }
      />
      <Button
        label="Request provisional (quiet)"
        variant="outline"
        onPress={() =>
          run('provisional', async () => {
            const p = await requestPermission(true);
            setPerm(p);
            return p.state;
          })
        }
      />

      <Text variant="headline">Batch</Text>
      <Text variant="caption">
        Count {count} · first in {delay}s · level {level} · sound {sound ? 'on' : 'off'} · action
        buttons {withCategory ? 'on' : 'off'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {COUNTS.map((n) => (
          <Button key={n} label={`N=${n}`} size="md" variant="tonal" onPress={() => setCount(n)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LEVELS.map((l) => (
          <Button key={l} label={l} size="md" variant="tonal" onPress={() => setLevel(l)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          label={`Sound ${sound ? 'off' : 'on'}`}
          variant="tonal"
          onPress={() => setSound((s) => !s)}
        />
        <Button
          label={`Actions ${withCategory ? 'off' : 'on'}`}
          variant="tonal"
          onPress={() => setWithCategory((s) => !s)}
        />
        <Button
          label={`Delay ${delay === 10 ? '60' : '10'}s`}
          variant="tonal"
          onPress={() => setDelay((d) => (d === 10 ? 60 : 10))}
        />
      </View>
      <Button
        label={`Schedule ${count} satest: reminders`}
        onPress={() =>
          run('schedule', async () => {
            const r = await scheduleSpikeBatch({
              count,
              firstDelaySec: delay,
              spacingSec: 30,
              level,
              sound,
              withCategory,
            });
            return `${r.scheduled}/${r.requested} scheduled, ${r.failed} failed`;
          })
        }
      />
      <Button
        label="Read pending count"
        variant="outline"
        onPress={() =>
          run('pending', async () => {
            const s = await listPending();
            return `total ${s.total} (satest ${s.spike}, other ${s.other}) ${describeCap(s.total)}`;
          })
        }
      />
      <Button
        label="Cancel all satest:"
        variant="destructive"
        destructiveStyle="text"
        onPress={() => run('cancel', async () => `${await cancelSpike()} cancelled`)}
      />

      <Text variant="headline">Log</Text>
      {log.map((line, i) => (
        <Text key={`${i}-${line}`} variant="caption">
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}
