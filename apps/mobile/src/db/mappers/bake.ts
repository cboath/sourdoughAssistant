import type {
  Bake,
  BakeItem,
  BakeMode,
  BakeStatus,
  BakeStep,
  BakeStepStatus,
  CostSnapshotV1,
  DurationSource,
  OvenSlotJson,
  RecipeSnapshotV1,
  StepKind,
} from '../types';
import { asBool, toJson, type FieldMap } from '../sql';

export interface BakeRow {
  id: string;
  status: BakeStatus;
  mode: BakeMode;
  requested_ready_at: string | null;
  original_ready_at: string;
  planned_ready_at: string;
  time_zone: string;
  kitchen_temp_c: number | null;
  oven_capacity: number;
  reheat_gap_min: number;
  heads_up_min: number;
  currency_code: string;
  oven_slots_json: string;
  notes: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const BAKE_FIELDS: FieldMap = {
  status: 'status',
  mode: 'mode',
  requestedReadyAt: 'requested_ready_at',
  originalReadyAt: 'original_ready_at',
  plannedReadyAt: 'planned_ready_at',
  timeZone: 'time_zone',
  kitchenTempC: 'kitchen_temp_c',
  ovenCapacity: 'oven_capacity',
  reheatGapMin: 'reheat_gap_min',
  headsUpMin: 'heads_up_min',
  currencyCode: 'currency_code',
  ovenSlots: { col: 'oven_slots_json', enc: (v) => toJson(v) },
  notes: 'notes',
  startedAt: 'started_at',
  completedAt: 'completed_at',
  cancelledAt: 'cancelled_at',
};

export function toBake(row: BakeRow): Bake {
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    requestedReadyAt: row.requested_ready_at,
    originalReadyAt: row.original_ready_at,
    plannedReadyAt: row.planned_ready_at,
    timeZone: row.time_zone,
    kitchenTempC: row.kitchen_temp_c,
    ovenCapacity: row.oven_capacity,
    reheatGapMin: row.reheat_gap_min,
    headsUpMin: row.heads_up_min,
    currencyCode: row.currency_code,
    ovenSlots: JSON.parse(row.oven_slots_json) as OvenSlotJson[],
    notes: row.notes,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface BakeItemRow {
  id: string;
  bake_id: string;
  recipe_id: string | null;
  position: number;
  loaves: number;
  scale_factor: number;
  recipe_snapshot_json: string;
  cost_snapshot_json: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const BAKE_ITEM_FIELDS: FieldMap = {
  recipeId: 'recipe_id',
  position: 'position',
  loaves: 'loaves',
  scaleFactor: 'scale_factor',
  recipeSnapshot: { col: 'recipe_snapshot_json', enc: (v) => toJson(v) },
  costSnapshot: { col: 'cost_snapshot_json', enc: (v) => (v === null ? null : toJson(v)) },
};

export function toBakeItem(row: BakeItemRow): BakeItem {
  return {
    id: row.id,
    bakeId: row.bake_id,
    recipeId: row.recipe_id,
    position: row.position,
    loaves: row.loaves,
    scaleFactor: row.scale_factor,
    recipeSnapshot: JSON.parse(row.recipe_snapshot_json) as RecipeSnapshotV1,
    costSnapshot:
      row.cost_snapshot_json === null
        ? null
        : (JSON.parse(row.cost_snapshot_json) as CostSnapshotV1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface BakeStepRow {
  id: string;
  bake_id: string;
  bake_item_id: string | null;
  step_key: string;
  source_step_id: string | null;
  slot_index: number | null;
  position: number;
  name: string;
  kind: StepKind;
  is_alongside: number;
  duration_min: number;
  duration_source: DurationSource;
  min_min: number;
  max_min: number;
  original_planned_start_at: string;
  planned_start_at: string;
  planned_end_at: string;
  actual_start_at: string | null;
  actual_end_at: string | null;
  status: BakeStepStatus;
  inferred_done: number;
  fold_count: number | null;
  fold_interval_min: number | null;
  folds_done: number;
  fold_times_json: string;
  notify: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const BAKE_STEP_FIELDS: FieldMap = {
  bakeItemId: 'bake_item_id',
  stepKey: 'step_key',
  sourceStepId: 'source_step_id',
  slotIndex: 'slot_index',
  position: 'position',
  name: 'name',
  kind: 'kind',
  isAlongside: 'is_alongside',
  durationMin: 'duration_min',
  durationSource: 'duration_source',
  minMin: 'min_min',
  maxMin: 'max_min',
  originalPlannedStartAt: 'original_planned_start_at',
  plannedStartAt: 'planned_start_at',
  plannedEndAt: 'planned_end_at',
  actualStartAt: 'actual_start_at',
  actualEndAt: 'actual_end_at',
  status: 'status',
  inferredDone: 'inferred_done',
  foldCount: 'fold_count',
  foldIntervalMin: 'fold_interval_min',
  foldsDone: 'folds_done',
  foldTimes: { col: 'fold_times_json', enc: (v) => toJson(v) },
  notify: 'notify',
};

export function toBakeStep(row: BakeStepRow): BakeStep {
  return {
    id: row.id,
    bakeId: row.bake_id,
    bakeItemId: row.bake_item_id,
    stepKey: row.step_key,
    sourceStepId: row.source_step_id,
    slotIndex: row.slot_index,
    position: row.position,
    name: row.name,
    kind: row.kind,
    isAlongside: asBool(row.is_alongside),
    durationMin: row.duration_min,
    durationSource: row.duration_source,
    minMin: row.min_min,
    maxMin: row.max_min,
    originalPlannedStartAt: row.original_planned_start_at,
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    actualStartAt: row.actual_start_at,
    actualEndAt: row.actual_end_at,
    status: row.status,
    inferredDone: asBool(row.inferred_done),
    foldCount: row.fold_count,
    foldIntervalMin: row.fold_interval_min,
    foldsDone: row.folds_done,
    foldTimes: JSON.parse(row.fold_times_json) as string[],
    notify: asBool(row.notify),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
