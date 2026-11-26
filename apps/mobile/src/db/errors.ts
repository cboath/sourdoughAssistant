export type RepositoryErrorCode = 'notFound' | 'invalid';

/** Thrown by repositories for missing rows or input that breaks a rule the schema cannot express. */
export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

/** The database was written by a newer app version (ADR 0003 downgrade guard). */
export class DatabaseTooNewError extends Error {
  readonly databaseVersion: number;
  readonly appVersion: number;
  constructor(databaseVersion: number, appVersion: number) {
    super(
      `This data was written by a newer version of the app (schema ${databaseVersion}, this app supports ${appVersion}). Please update.`,
    );
    this.name = 'DatabaseTooNewError';
    this.databaseVersion = databaseVersion;
    this.appVersion = appVersion;
  }
}
