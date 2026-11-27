import { SEED_CATALOG } from '../../../db/seed';
import { createTestDb } from '../../../db/test-utils';
import { createPantryService } from '../services/pantryService';

const bread = SEED_CATALOG.pantry.find((p) => p.seedKey === 'pantry:bread-flour');

async function setup() {
  const db = await createTestDb();
  const onChange = jest.fn();
  const service = createPantryService(db.repos, onChange);
  return { ...db, service, onChange };
}

describe('pantryService', () => {
  it('creates an unpriced item, prices it, and undo returns it to unpriced', async () => {
    const { repos, service, onChange } = await setup();
    const item = await service.createItem({ name: 'Rye flour', category: 'flour' });
    expect(item.packagePriceCents).toBeNull();

    const entry = await service.savePrice(item.id, {
      packagePriceCents: 450,
      packageSize: 2,
      packageUnit: 'kg',
      store: 'Co-op',
      pricedAt: '2026-11-20',
    });
    expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(450);

    await service.undoSavePrice(entry, item);
    const after = await repos.pantry.get(item.id);
    expect(after).toMatchObject({ packagePriceCents: null, packageSize: null, packageUnit: null });
    expect(await repos.priceHistory.listForItem(item.id)).toHaveLength(0);
    expect(onChange).toHaveBeenCalled();
  });

  it('a later price becomes current; undo re-mirrors the previous one', async () => {
    const { repos, service } = await setup();
    const item = await service.createItem({
      name: 'Bread flour',
      packagePriceCents: 1200,
      packageSize: 5,
      packageUnit: 'kg',
      pricedAt: '2026-11-01',
    });
    const entry = await service.savePrice(item.id, {
      packagePriceCents: 1300,
      packageSize: 5,
      packageUnit: 'kg',
      store: null,
      pricedAt: '2026-11-10',
    });
    expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(1300);
    await service.undoSavePrice(entry, item);
    expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(1200);
  });

  it('writes a typed density with the price in one step', async () => {
    const { repos, service } = await setup();
    const item = await service.createItem({ name: 'Honey' });
    await service.savePrice(item.id, {
      packagePriceCents: 900,
      packageSize: 1,
      packageUnit: 'cup',
      store: null,
      pricedAt: '2026-11-20',
      gramsPerCup: 340,
    });
    expect((await repos.pantry.get(item.id))?.gramsPerCup).toBe(340);
  });

  it('deletes and restores a history entry', async () => {
    const { repos, service } = await setup();
    const item = await service.createItem({
      name: 'Salt',
      packagePriceCents: 100,
      packageSize: 1,
      packageUnit: 'kg',
      pricedAt: '2026-11-01',
    });
    const newer = await service.savePrice(item.id, {
      packagePriceCents: 150,
      packageSize: 1,
      packageUnit: 'kg',
      store: null,
      pricedAt: '2026-11-15',
    });
    await service.deletePrice(newer.id);
    expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(100);
    await service.restorePrice(newer.id);
    expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(150);
  });

  it('archives and unarchives, and the item keeps its price for recipes', async () => {
    const { repos, service } = await setup();
    const item = await service.createItem({ name: bread?.item.name ?? 'Bread flour' });
    await service.archive(item.id);
    expect(await repos.pantry.get(item.id)).toBeNull();
    expect((await repos.pantry.getByIds([item.id], { includeArchived: true }))[0]?.id).toBe(
      item.id,
    );
    await service.unarchive(item.id);
    expect((await repos.pantry.get(item.id))?.deletedAt).toBeNull();
  });
});
