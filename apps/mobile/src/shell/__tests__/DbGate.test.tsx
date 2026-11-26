import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { DatabaseTooNewError } from '../../db/errors';
import type { Repositories } from '../../db/repositories';
import { useRepositories } from '../../state/repositories';
import { renderWithTheme } from '../../ui/testing';
import { bootstrapApp, type BootstrapDeps } from '../bootstrap';
import { DbGate } from '../DbGate';

const fakeRepos = { settings: {}, marker: 'repos' } as unknown as Repositories;

function makeDeps(overrides: Partial<BootstrapDeps> = {}, calls: string[] = []): BootstrapDeps {
  return {
    getRepositories: jest.fn(async () => {
      calls.push('open');
      return fakeRepos;
    }),
    seed: jest.fn(async () => {
      calls.push('seed');
    }),
    hydrateSettings: jest.fn(async () => {
      calls.push('hydrate');
    }),
    localeDefaults: () => ({ unitSystem: 'metric', temperatureUnit: 'C' }),
    ...overrides,
  };
}

function Probe() {
  const repos = useRepositories();
  return <Text>{(repos as unknown as { marker: string }).marker}</Text>;
}

describe('bootstrapApp', () => {
  it('opens, seeds, then hydrates settings, in that order', async () => {
    const calls: string[] = [];
    const deps = makeDeps({}, calls);
    await expect(bootstrapApp(deps)).resolves.toBe(fakeRepos);
    expect(calls).toEqual(['open', 'seed', 'hydrate']);
    expect(deps.hydrateSettings).toHaveBeenCalledWith(fakeRepos.settings, {
      unitSystem: 'metric',
      temperatureUnit: 'C',
    });
  });

  it('does not hydrate when seeding fails', async () => {
    const deps = makeDeps({ seed: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(bootstrapApp(deps)).rejects.toThrow('boom');
    expect(deps.hydrateSettings).not.toHaveBeenCalled();
  });
});

describe('DbGate', () => {
  it('renders no children until ready, then provides repositories and settles once', async () => {
    let resolve!: (r: Repositories) => void;
    const deps = makeDeps({
      getRepositories: () => new Promise<Repositories>((r) => (resolve = r)),
    });
    const onSettled = jest.fn();
    await renderWithTheme(
      <DbGate deps={deps} onSettled={onSettled}>
        <Probe />
      </DbGate>,
    );
    expect(screen.queryByText('repos')).toBeNull();
    expect(onSettled).not.toHaveBeenCalled();
    await act(async () => resolve(fakeRepos));
    await waitFor(() => expect(screen.getByText('repos')).toBeTruthy());
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('shows a retry screen on failure, and retry reruns the sequence', async () => {
    const getRepositories = jest
      .fn<Promise<Repositories>, []>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(fakeRepos);
    const onSettled = jest.fn();
    await renderWithTheme(
      <DbGate deps={makeDeps({ getRepositories })} onSettled={onSettled}>
        <Probe />
      </DbGate>,
    );
    await waitFor(() => expect(screen.getByTestId('startup-error')).toBeTruthy());
    expect(onSettled).toHaveBeenCalled();
    // The raw error message is not shown to the user.
    expect(screen.queryByText(/disk full/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('repos')).toBeTruthy());
    expect(getRepositories).toHaveBeenCalledTimes(2);
  });

  it('asks the user to update (no retry) when the database is from a newer version', async () => {
    const deps = makeDeps({
      getRepositories: jest.fn().mockRejectedValue(new DatabaseTooNewError(5, 1)),
    });
    await renderWithTheme(
      <DbGate deps={deps}>
        <Probe />
      </DbGate>,
    );
    await waitFor(() => expect(screen.getByText('Please update the app')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
