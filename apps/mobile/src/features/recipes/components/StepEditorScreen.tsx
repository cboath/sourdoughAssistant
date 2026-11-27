import { randomUUID } from 'expo-crypto';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, View } from 'react-native';
import type { AlongsideAlign, StepKind } from '@sourdough/core';
import { t, tp, type MessageKey } from '../../../lib/i18n';
import { parseNumberInput } from '../../../lib/number';
import { LIMITS } from '../../../lib/sanitize';
import { showSnackbar } from '../../../state/snackbar';
import {
  Banner,
  Button,
  ContentColumn,
  EditorGone,
  ListRow,
  RangeField,
  SegmentedControl,
  Sheet,
  Stepper,
  Text,
  TextField,
  type TextFieldRef,
} from '../../../ui/components';
import { editorHeaderOptions } from '../../../ui/editorHeader';
import { haptic } from '../../../ui/haptics';
import { useTheme } from '../../../ui/theme';
import { useAnnounce } from '../../../ui/hooks/useAnnounce';
import { useDiscardGuard } from '../../../ui/useDiscardGuard';
import { useDisplayContext } from '../../cost/hooks/useDisplayContext';
import { formatDuration } from '../format';
import {
  STEP_KINDS,
  kindLabel,
  newStepState,
  previewSentence,
  stateFromStep,
  validateStepForm,
  type StepFormErrors,
  type StepFormState,
} from '../stepForm';
import { useRecipeDraft } from '../store';

export function StepEditorScreen({ stepId }: { stepId?: string }) {
  const draft = useRecipeDraft((s) => s.draft);
  const gone = (
    <EditorGone
      pushed
      title={t('step.gone')}
      headerTitle={t('step.titleEdit')}
      actionLabel={t('ingr.backToRecipe')}
    />
  );
  if (!draft) return gone;
  const step = stepId ? draft.steps.find((s) => s.id === stepId) : undefined;
  if (stepId && !step) return gone;
  return <StepForm stepId={stepId} />;
}

const ALIGNS: readonly AlongsideAlign[] = ['endsAtStart', 'startsAtStart', 'endsAtEnd'];

function StepForm({ stepId }: { stepId?: string }) {
  const router = useRouter();
  const { space } = useTheme();
  const display = useDisplayContext();
  const store = useRecipeDraft.getState;
  const steps = useRecipeDraft((s) => s.draft?.steps ?? []);
  const existing = stepId ? steps.find((s) => s.id === stepId) : undefined;
  const editing = existing !== undefined;
  const id = useRef(stepId ?? randomUUID()).current;
  const initial = useRef(existing ? stateFromStep(existing) : newStepState()).current;
  const [state, setState] = useState<StepFormState>(initial);
  const [errors, setErrors] = useState<StepFormErrors>({});
  const [kindOpen, setKindOpen] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameRef = useRef<TextFieldRef>(null);

  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  const guard = useDiscardGuard(dirty, {
    title: t('step.discard.title'),
    confirmLabel: t('common.discard.confirm'),
    cancelLabel: t('common.discard.keep'),
    destructive: true,
  });

  const patch = (change: Partial<StepFormState>) => {
    setState((s) => ({ ...s, ...change }));
    setErrors({});
  };

  const others = useMemo(() => steps.filter((s) => s.id !== id), [steps, id]);
  const index = existing ? steps.findIndex((s) => s.id === id) : steps.length;
  const dependents = useMemo(
    () => others.filter((s) => s.anchor.type === 'alongside' && s.anchor.stepId === id),
    [others, id],
  );
  const sequentialOthers = others.filter((s) => s.anchor.type === 'sequential');
  const anchorChoices = sequentialOthers;
  const anchor = state.anchorStepId ? steps.find((s) => s.id === state.anchorStepId) : undefined;

  const folds = state.timing === 'folds';
  const tempDisabledReason = folds
    ? t('step.temp.disabledFolds')
    : state.noRange
      ? t('step.temp.disabledNoRange')
      : null;
  const alongsideDisabledReason =
    dependents.length > 0
      ? t('step.alongside.isAnchor', { other: dependents[0]?.name ?? '' })
      : sequentialOthers.length === 0
        ? t('step.alongside.onlyMain')
        : null;

  const done = () => {
    const result = validateStepForm(state, id, others, index);
    setErrors(result.errors);
    if (!result.step) {
      setFailed(true);
      haptic('warning');
      AccessibilityInfo.announceForAccessibility(
        tp('val.announce', Object.keys(result.errors).length),
      );
      if (result.errors.name) nameRef.current?.focus();
      return;
    }
    store().upsertStep(result.step);
    guard.allowLeave();
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    const removed = store().removeStep(existing.id);
    guard.allowLeave();
    router.back();
    if (!removed) return;
    const first = removed.dependents[0];
    showSnackbar({
      message: first
        ? t('edit.stepDeletedAnchor', { name: existing.name, other: first.name })
        : t('edit.stepDeleted', { name: existing.name }),
      actionLabel: t('common.undo'),
      onAction: () => {
        haptic('impactLight');
        store().insertStep(removed.item, removed.index);
      },
    });
  };

  const setKind = (kind: StepKind) => {
    patch({ kind, ...(kind === 'fold' ? { timing: 'folds' as const } : {}) });
    setKindOpen(false);
  };

  const minutesField = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    error?: string,
    testID?: string,
  ) => (
    <TextField
      label={label}
      variant="number"
      suffix={t('duration.minutesShort')}
      value={String(value)}
      onChangeText={(text) => {
        const n = parseNumberInput(text, display.locale);
        onChange(n.ok ? Math.max(0, Math.round(n.value)) : 0);
      }}
      error={error}
      testID={testID}
    />
  );

  const preview = previewSentence(state, anchor?.name ?? null, display.locale);
  const foldTotal = state.foldCount * state.foldIntervalMin;
  const foldTotalText = t('step.folds.total', {
    total: formatDuration(foldTotal, display.locale),
    count: state.foldCount,
    interval: formatDuration(state.foldIntervalMin, display.locale),
  });
  useAnnounce(state.timing === 'folds' ? foldTotalText : null, 1000);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={editorHeaderOptions({
          title: t(editing ? 'step.titleEdit' : 'step.titleNew'),
          onClose: () => router.back(),
          onSave: done,
          saveLabel: t('common.done'),
          pushed: true,
        })}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space.xxxl }}
      >
        <ContentColumn padded={false}>
          <View style={{ padding: space.lg, gap: space.lg }}>
            {failed && Object.keys(errors).length > 0 ? (
              <Banner variant="danger" message={tp('val.summary', Object.keys(errors).length)} />
            ) : null}
            {errors.step ? <Banner variant="danger" message={errors.step} /> : null}
            <TextField
              ref={nameRef}
              label={t('step.name')}
              value={state.name}
              onChangeText={(name) => patch({ name })}
              maxLength={LIMITS.stepName}
              error={errors.name}
              testID="step-name"
            />
          </View>
          <ListRow
            variant="value"
            title={t('step.type')}
            value={kindLabel(state.kind)}
            onPress={() => setKindOpen(true)}
            testID="step-kind"
          />
          <Text variant="footnote" color="textSecondary" style={{ paddingHorizontal: space.lg }}>
            {t('step.type.help')}
          </Text>

          <View style={{ padding: space.lg, gap: space.lg }}>
            <View style={{ gap: space.sm }}>
              <Text variant="subhead" accessible={false} importantForAccessibility="no">
                {t('step.timing')}
              </Text>
              <SegmentedControl
                label={t('step.timing')}
                value={state.timing}
                onChange={(timing) => {
                  haptic('selection');
                  patch({ timing });
                }}
                segments={[
                  { value: 'duration', label: t('step.timing.duration') },
                  { value: 'folds', label: t('step.timing.folds') },
                ]}
                testID="step-timing"
              />
            </View>

            {state.timing === 'duration' ? (
              <View style={{ gap: space.sm }}>
                <RangeField
                  label={t('step.duration')}
                  range={
                    state.noRange
                      ? null
                      : { minMin: state.minMin, defaultMin: state.defaultMin, maxMin: state.maxMin }
                  }
                  defaultMin={state.defaultMin}
                  onChange={({ range, defaultMin }) =>
                    patch(
                      range
                        ? {
                            noRange: false,
                            minMin: range.minMin,
                            maxMin: range.maxMin,
                            defaultMin,
                          }
                        : { noRange: true, defaultMin, minMin: defaultMin, maxMin: defaultMin },
                    )
                  }
                  testID="step-range"
                />
                {(errors.default && errors.default !== t('range.invalid')) || errors.min ? (
                  <Text variant="footnote" color="danger" accessibilityRole="alert">
                    {errors.default ?? errors.min}
                  </Text>
                ) : null}
                <Text variant="footnote" color="textSecondary">
                  {t('step.range.help')}
                </Text>
              </View>
            ) : (
              <View style={{ gap: space.md }}>
                <View style={{ gap: space.xs }}>
                  <Text variant="subhead" accessible={false} importantForAccessibility="no">
                    {t('step.folds.count')}
                  </Text>
                  <Stepper
                    label={t('step.folds.count')}
                    value={state.foldCount}
                    min={1}
                    max={12}
                    onChange={(foldCount) => {
                      haptic('selection');
                      patch({ foldCount });
                    }}
                    testID="fold-count"
                  />
                </View>
                {minutesField(
                  t('step.folds.every'),
                  state.foldIntervalMin,
                  (foldIntervalMin) => patch({ foldIntervalMin }),
                  errors.folds,
                  'fold-interval',
                )}
                <Text variant="callout" numeric>
                  {foldTotalText}
                </Text>
              </View>
            )}
          </View>

          <ListRow
            variant="toggle"
            title={t('step.temp')}
            subtitle={tempDisabledReason ?? t('step.temp.help')}
            checked={state.tempSensitive}
            disabled={tempDisabledReason !== null}
            onCheckedChange={(tempSensitive) => patch({ tempSensitive })}
            accessibilityLabel={`${t('step.temp')}, ${tempDisabledReason ?? t('step.temp.help')}`}
            testID="step-temp"
          />
          <ListRow
            variant="toggle"
            title={t('step.alongside')}
            subtitle={alongsideDisabledReason ?? t('step.alongside.help')}
            checked={state.alongside}
            disabled={alongsideDisabledReason !== null}
            onCheckedChange={(alongside) =>
              patch({
                alongside,
                anchorStepId: alongside
                  ? (state.anchorStepId ?? anchorChoices[0]?.id ?? null)
                  : null,
              })
            }
            accessibilityLabel={`${t('step.alongside')}, ${alongsideDisabledReason ?? t('step.alongside.help')}`}
            testID="step-alongside"
          />
          {state.alongside ? (
            <View>
              <ListRow
                variant="value"
                title={t('step.alongside.step')}
                value={
                  anchor
                    ? `${steps.findIndex((s) => s.id === anchor.id) + 1}. ${anchor.name}`
                    : t('step.alongside.pick')
                }
                onPress={() => setAnchorOpen(true)}
                testID="step-anchor"
              />
              {errors.anchor ? (
                <Text variant="footnote" color="danger" style={{ paddingHorizontal: space.lg }}>
                  {errors.anchor}
                </Text>
              ) : null}
              <View accessibilityRole="radiogroup" accessibilityLabel={t('step.timing')}>
                {ALIGNS.map((align) => (
                  <ListRow
                    key={align}
                    variant="selectable"
                    selectionMode="single"
                    title={t(`step.align.${align}` as MessageKey, { step: anchor?.name ?? '…' })}
                    checked={state.align === align}
                    onPress={() => patch({ align })}
                    testID={`align-${align}`}
                  />
                ))}
              </View>
              <View style={{ padding: space.lg, gap: space.md }}>
                {minutesField(
                  t('step.offset'),
                  state.offsetMin,
                  (offsetMin) => patch({ offsetMin }),
                  errors.offset,
                  'step-offset',
                )}
                <SegmentedControl
                  label={t('step.offset')}
                  value={state.offsetDir}
                  onChange={(offsetDir) => patch({ offsetDir })}
                  segments={[
                    { value: 'earlier', label: t('step.offset.earlier') },
                    { value: 'later', label: t('step.offset.later') },
                  ]}
                />
                {preview ? (
                  <Text variant="callout" testID="step-preview">
                    {preview}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
          <ListRow
            variant="toggle"
            title={t('step.notify')}
            subtitle={t('step.notify.help')}
            checked={state.notify}
            onCheckedChange={(notify) => patch({ notify })}
            testID="step-notify"
          />
          <View style={{ padding: space.lg }}>
            <TextField
              label={t('step.notes')}
              variant="multiline"
              value={state.notes}
              onChangeText={(notes) => patch({ notes })}
              maxLength={LIMITS.stepNotes}
              testID="step-notes"
            />
          </View>
          {editing ? (
            <View style={{ alignItems: 'center' }}>
              <Button
                variant="destructive"
                destructiveStyle="text"
                label={t('step.delete')}
                onPress={remove}
                testID="delete-step"
              />
            </View>
          ) : null}
        </ContentColumn>
      </ScrollView>

      <Sheet visible={kindOpen} onClose={() => setKindOpen(false)} title={t('step.type')}>
        <View accessibilityRole="radiogroup">
          {STEP_KINDS.map((kind) => (
            <ListRow
              key={kind}
              variant="selectable"
              selectionMode="single"
              title={kindLabel(kind)}
              checked={state.kind === kind}
              onPress={() => setKind(kind)}
              testID={`kind-${kind}`}
            />
          ))}
        </View>
      </Sheet>
      <Sheet
        visible={anchorOpen}
        onClose={() => setAnchorOpen(false)}
        title={t('step.alongside.step')}
      >
        <View accessibilityRole="radiogroup">
          {anchorChoices.map((s) => (
            <ListRow
              key={s.id}
              variant="selectable"
              selectionMode="single"
              title={`${steps.findIndex((x) => x.id === s.id) + 1}. ${s.name}`}
              checked={state.anchorStepId === s.id}
              onPress={() => {
                patch({ anchorStepId: s.id });
                setAnchorOpen(false);
              }}
              testID={`anchor-${s.id}`}
            />
          ))}
        </View>
      </Sheet>
    </View>
  );
}
