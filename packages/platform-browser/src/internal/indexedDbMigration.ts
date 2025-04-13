import { TypeIdError } from "@effect/platform/Error"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as HashMap from "effect/HashMap"
import { pipeArguments } from "effect/Pipeable"
import * as Schema from "effect/Schema"
import type {
  ErrorTypeId as IndexedDbMigrationErrorTypeId,
  IndexedDbMigration,
  TypeId as IndexedDbMigrationTypeId
} from "../IndexedDbMigration.js"
import type * as IndexedDbTable from "../IndexedDbTable.js"
import type * as IndexedDbVersion from "../IndexedDbVersion.js"

type IsStringLiteral<T> = T extends string ? string extends T ? false
  : true
  : false

/** @internal */
export type IndexFromTable<
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<
    IndexedDbVersion.IndexedDbVersion.Tables<Source>
  >
> = IsStringLiteral<
  Extract<
    keyof IndexedDbTable.IndexedDbTable.Indexes<
      IndexedDbTable.IndexedDbTable.WithName<
        IndexedDbVersion.IndexedDbVersion.Tables<Source>,
        Table
      >
    >,
    string
  >
> extends true ? Extract<
    keyof IndexedDbTable.IndexedDbTable.Indexes<
      IndexedDbTable.IndexedDbTable.WithName<
        IndexedDbVersion.IndexedDbVersion.Tables<Source>,
        Table
      >
    >,
    string
  > :
  never

/** @internal */
export const TypeId: IndexedDbMigrationTypeId = Symbol.for(
  "@effect/platform-browser/IndexedDbMigration"
) as IndexedDbMigrationTypeId

/** @internal */
export const ErrorTypeId: IndexedDbMigrationErrorTypeId = Symbol.for(
  "@effect/platform-browser/IndexedDbMigration/IndexedDbMigrationError"
) as IndexedDbMigrationErrorTypeId

/** @internal */
export class IndexedDbMigrationError extends TypeIdError(
  ErrorTypeId,
  "IndexedDbMigrationError"
)<{
  readonly reason:
    | "OpenError"
    | "TransactionError"
    | "DecodeError"
    | "Blocked"
    | "UpgradeError"
    | "MissingTable"
    | "MissingIndex"
  readonly cause: unknown
}> {
  get message() {
    return this.reason
  }
}

/** @internal */
export interface MigrationApi<
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps
> {
  readonly createObjectStore: <
    A extends IndexedDbTable.IndexedDbTable.TableName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>
    >
  >(table: A) => Effect.Effect<globalThis.IDBObjectStore, IndexedDbMigrationError>

  readonly deleteObjectStore: <
    A extends IndexedDbTable.IndexedDbTable.TableName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>
    >
  >(table: A) => Effect.Effect<void, IndexedDbMigrationError>

  readonly createIndex: <
    A extends IndexedDbTable.IndexedDbTable.TableName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>
    >
  >(
    table: A,
    indexName: IndexFromTable<Source, A>,
    options?: IDBIndexParameters
  ) => Effect.Effect<globalThis.IDBIndex, IndexedDbMigrationError>

  readonly deleteIndex: <
    A extends IndexedDbTable.IndexedDbTable.TableName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>
    >
  >(table: A, indexName: IndexFromTable<Source, A>) => Effect.Effect<void, IndexedDbMigrationError>

  readonly getAll: <
    A extends IndexedDbTable.IndexedDbTable.TableName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>
    >
  >(table: A) => Effect.Effect<
    Array<
      Schema.Schema.Type<
        IndexedDbTable.IndexedDbTable.TableSchema<
          IndexedDbTable.IndexedDbTable.WithName<
            IndexedDbVersion.IndexedDbVersion.Tables<Source>,
            A
          >
        >
      >
    >,
    IndexedDbMigrationError
  >

  readonly insert: <
    A extends IndexedDbTable.IndexedDbTable.TableName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>
    >
  >(
    table: A,
    data: Schema.Schema.Encoded<
      IndexedDbTable.IndexedDbTable.TableSchema<
        IndexedDbTable.IndexedDbTable.WithName<
          IndexedDbVersion.IndexedDbVersion.Tables<Source>,
          A
        >
      >
    >
  ) => Effect.Effect<globalThis.IDBValidKey, IndexedDbMigrationError>

  readonly insertAll: <
    A extends IndexedDbTable.IndexedDbTable.TableName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>
    >
  >(
    table: A,
    dataList: ReadonlyArray<
      Schema.Schema.Encoded<
        IndexedDbTable.IndexedDbTable.TableSchema<
          IndexedDbTable.IndexedDbTable.WithName<
            IndexedDbVersion.IndexedDbVersion.Tables<Source>,
            A
          >
        >
      >
    >
  ) => Effect.Effect<globalThis.IDBValidKey, IndexedDbMigrationError>
}

/** @internal */
export const migrationApi = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps
>(
  database: IDBDatabase,
  transaction: IDBTransaction,
  source: Source
): MigrationApi<Source> => {
  const insert = <
    A extends IndexedDbTable.IndexedDbTable.TableName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>
    >
  >(
    table: A,
    data: Schema.Schema.Encoded<
      IndexedDbTable.IndexedDbTable.TableSchema<
        IndexedDbTable.IndexedDbTable.WithName<
          IndexedDbVersion.IndexedDbVersion.Tables<Source>,
          A
        >
      >
    >
  ) =>
    Effect.gen(function*() {
      const { tableSchema } = yield* HashMap.get(source.tables, table).pipe(
        Effect.catchTag(
          "NoSuchElementException",
          (cause) =>
            new IndexedDbMigrationError({
              reason: "MissingTable",
              cause
            })
        )
      )

      yield* Schema.decodeUnknown(tableSchema)(data).pipe(
        Effect.catchTag("ParseError", (cause) =>
          new IndexedDbMigrationError({
            reason: "DecodeError",
            cause
          }))
      )

      return yield* Effect.async<globalThis.IDBValidKey, IndexedDbMigrationError>((resume) => {
        const objectStore = transaction.objectStore(table)
        const request = objectStore.add(data)

        request.onerror = () => {
          resume(
            Effect.fail(
              new IndexedDbMigrationError({
                reason: "TransactionError",
                cause: request.error
              })
            )
          )
        }

        request.onsuccess = () => {
          resume(Effect.succeed(request.result))
        }
      })
    })

  return {
    insert,
    insertAll: (table, dataList) => Effect.all(dataList.map((data) => insert(table, data))),

    createObjectStore: (table) =>
      Effect.gen(function*() {
        const createTable = yield* HashMap.get(source.tables, table).pipe(
          Effect.catchTag(
            "NoSuchElementException",
            (cause) =>
              new IndexedDbMigrationError({
                reason: "MissingTable",
                cause
              })
          )
        )

        return yield* Effect.try({
          try: () =>
            database.createObjectStore(
              createTable.tableName,
              createTable.options
            ),
          catch: (cause) =>
            new IndexedDbMigrationError({
              reason: "TransactionError",
              cause
            })
        })
      }),

    deleteObjectStore: (table) =>
      Effect.gen(function*() {
        const createTable = yield* HashMap.get(source.tables, table).pipe(
          Effect.catchTag(
            "NoSuchElementException",
            (cause) =>
              new IndexedDbMigrationError({
                reason: "MissingTable",
                cause
              })
          )
        )

        return yield* Effect.try({
          try: () => database.deleteObjectStore(createTable.tableName),
          catch: (cause) =>
            new IndexedDbMigrationError({
              reason: "TransactionError",
              cause
            })
        })
      }),

    createIndex: (table, indexName, options) =>
      Effect.gen(function*() {
        const store = transaction.objectStore(table)
        const sourceTable = HashMap.unsafeGet(source.tables, table)

        const keyPath = yield* Effect.fromNullable(
          sourceTable.options?.indexes[indexName] ?? undefined
        ).pipe(
          Effect.catchTag("NoSuchElementException", (error) =>
            new IndexedDbMigrationError({
              reason: "MissingIndex",
              cause: Cause.fail(error)
            }))
        )

        return yield* Effect.try({
          try: () => store.createIndex(indexName, keyPath, options),
          catch: (cause) =>
            new IndexedDbMigrationError({
              reason: "TransactionError",
              cause
            })
        })
      }),

    deleteIndex: (table, indexName) =>
      Effect.gen(function*() {
        const store = transaction.objectStore(table)
        return yield* Effect.try({
          try: () => store.deleteIndex(indexName),
          catch: (cause) =>
            new IndexedDbMigrationError({
              reason: "TransactionError",
              cause
            })
        })
      }),

    getAll: (table) =>
      Effect.gen(function*() {
        const { tableName, tableSchema } = yield* HashMap.get(
          source.tables,
          table
        ).pipe(
          Effect.catchTag(
            "NoSuchElementException",
            (cause) =>
              new IndexedDbMigrationError({
                reason: "MissingTable",
                cause
              })
          )
        )

        const data = yield* Effect.async<any, IndexedDbMigrationError>(
          (resume) => {
            const store = transaction.objectStore(tableName)
            const request = store.getAll()

            request.onerror = () => {
              resume(
                Effect.fail(
                  new IndexedDbMigrationError({
                    reason: "TransactionError",
                    cause: request.error
                  })
                )
              )
            }

            request.onsuccess = () => {
              resume(Effect.succeed(request.result))
            }
          }
        )

        const tableSchemaArray = Schema.Array(
          tableSchema
        ) as unknown as IndexedDbTable.IndexedDbTable.TableSchema<
          IndexedDbTable.IndexedDbTable.WithName<
            IndexedDbVersion.IndexedDbVersion.Tables<Source>,
            typeof tableName
          >
        >

        return yield* Schema.decodeUnknown(tableSchemaArray)(data).pipe(
          Effect.catchTag("ParseError", (cause) =>
            new IndexedDbMigrationError({
              reason: "DecodeError",
              cause
            }))
        )
      })
  }
}

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/** @internal */
export const makeInitialProto = <
  InitialVersion extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Error
>(
  initialVersion: InitialVersion,
  init: (
    toQuery: MigrationApi<InitialVersion>
  ) => Effect.Effect<void, Error>
): IndexedDbMigration.Initial<InitialVersion, Error> => {
  function IndexedDbMigration() {}
  Object.setPrototypeOf(IndexedDbMigration, Proto)
  IndexedDbMigration.version = initialVersion
  IndexedDbMigration.execute = init
  IndexedDbMigration._tag = "Initial"

  IndexedDbMigration.add = <
    Version extends IndexedDbVersion.IndexedDbVersion.AnyWithProps
  >(
    version: Version,
    execute: (
      fromQuery: MigrationApi<InitialVersion>,
      toQuery: MigrationApi<Version>
    ) => Effect.Effect<void, Error>
  ) =>
    makeProto({
      fromVersion: initialVersion,
      toVersion: version,
      execute,
      previous: IndexedDbMigration as any
    })

  return IndexedDbMigration as any
}

/** @internal */
export const makeProto = <
  FromVersion extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  ToVersion extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Error
>(options: {
  readonly previous:
    | IndexedDbMigration.Migration<FromVersion, ToVersion, Error>
    | IndexedDbMigration.Initial<FromVersion, Error>
  readonly fromVersion: FromVersion
  readonly toVersion: ToVersion
  readonly execute: (
    fromQuery: MigrationApi<FromVersion>,
    toQuery: MigrationApi<ToVersion>
  ) => Effect.Effect<void, Error>
}): IndexedDbMigration.Migration<FromVersion, ToVersion, Error> => {
  function IndexedDbMigration() {}
  Object.setPrototypeOf(IndexedDbMigration, Proto)
  IndexedDbMigration.previous = options.previous
  IndexedDbMigration.fromVersion = options.fromVersion
  IndexedDbMigration.toVersion = options.toVersion
  IndexedDbMigration.execute = options.execute
  IndexedDbMigration._tag = "Migration"
  return IndexedDbMigration as any
}
