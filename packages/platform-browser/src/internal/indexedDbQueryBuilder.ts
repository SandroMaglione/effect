import * as Effect from "effect/Effect"
import * as Effectable from "effect/Effectable"
import * as HashMap from "effect/HashMap"
import { pipeArguments } from "effect/Pipeable"
import * as Schema from "effect/Schema"
import type * as IndexedDbMigration from "../IndexedDbMigration.js"
import * as IndexedDbQuery from "../IndexedDbQuery.js"
import type { IndexedDbQueryBuilder, TypeId as IndexedDbQueryBuilderTypeId } from "../IndexedDbQueryBuilder.js"
import type * as IndexedDbTable from "../IndexedDbTable.js"
import type * as IndexedDbVersion from "../IndexedDbVersion.js"

type IsNever<T> = [T] extends [never] ? true : false

/** @internal */
export type ExtractIndexType<
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>,
  Index extends IndexedDbMigration.IndexFromTable<Source, Table>
> = IsNever<Index> extends true ? Schema.Schema.Type<
    IndexedDbTable.IndexedDbTable.TableSchema<
      IndexedDbTable.IndexedDbTable.WithName<
        IndexedDbVersion.IndexedDbVersion.Tables<Source>,
        Table
      >
    >
  >[
    IndexedDbTable.IndexedDbTable.KeyPath<
      IndexedDbTable.IndexedDbTable.WithName<
        IndexedDbVersion.IndexedDbVersion.Tables<Source>,
        Table
      >
    >
  ]
  : Schema.Schema.Type<
    IndexedDbTable.IndexedDbTable.TableSchema<
      IndexedDbTable.IndexedDbTable.WithName<
        IndexedDbVersion.IndexedDbVersion.Tables<Source>,
        Table
      >
    >
  >[
    IndexedDbTable.IndexedDbTable.Indexes<
      IndexedDbTable.IndexedDbTable.WithName<
        IndexedDbVersion.IndexedDbVersion.Tables<Source>,
        Table
      >
    >[Index]
  ]

/** @internal */
export type SourceTableSchemaType<
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>
> = Schema.Schema.Type<
  IndexedDbTable.IndexedDbTable.TableSchema<
    IndexedDbTable.IndexedDbTable.WithName<
      IndexedDbVersion.IndexedDbVersion.Tables<Source>,
      Table
    >
  >
>

/** @internal */
export const TypeId: IndexedDbQueryBuilderTypeId = Symbol.for(
  "@effect/platform-browser/IndexedDbQueryBuilder"
) as IndexedDbQueryBuilderTypeId

const BasicProto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const Proto = {
  ...Effectable.CommitPrototype,
  [TypeId]: TypeId
}

/** @internal */
export const applyDelete = (query: IndexedDbQueryBuilder.Delete) =>
  Effect.async<any, IndexedDbQuery.IndexedDbQueryError>((resume) => {
    const database = query.delete.from.database
    const IDBKeyRange = query.delete.from.IDBKeyRange
    const objectStore = database.transaction([query.delete.from.table], "readwrite").objectStore(
      query.delete.from.table
    )

    let keyRange: globalThis.IDBKeyRange | undefined = undefined

    if (query.only !== undefined) {
      keyRange = IDBKeyRange.only(query.only)
    } else if (query.lowerBound !== undefined && query.upperBound !== undefined) {
      keyRange = IDBKeyRange.bound(
        query.lowerBound,
        query.upperBound,
        query.excludeLowerBound,
        query.excludeUpperBound
      )
    } else if (query.lowerBound !== undefined) {
      keyRange = IDBKeyRange.lowerBound(query.lowerBound, query.excludeLowerBound)
    } else if (query.upperBound !== undefined) {
      keyRange = IDBKeyRange.upperBound(query.upperBound, query.excludeUpperBound)
    }

    let request: globalThis.IDBRequest

    if (query.limitValue !== undefined) {
      const cursorRequest = objectStore.openCursor()
      let count = 0

      cursorRequest.onerror = () => {
        resume(
          Effect.fail(
            new IndexedDbQuery.IndexedDbQueryError({ reason: "TransactionError", cause: cursorRequest.error })
          )
        )
      }

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor !== null) {
          const deleteRequest = cursor.delete()

          deleteRequest.onerror = () => {
            resume(
              Effect.fail(
                new IndexedDbQuery.IndexedDbQueryError({ reason: "TransactionError", cause: deleteRequest.error })
              )
            )
          }

          count += 1
          if (count > query.limitValue!) {
            cursor.continue()
          }
        }

        resume(Effect.void)
      }
    } else if (keyRange !== undefined) {
      request = objectStore.delete(keyRange)

      request.onerror = (event) => {
        resume(
          Effect.fail(
            new IndexedDbQuery.IndexedDbQueryError({
              reason: "TransactionError",
              cause: event
            })
          )
        )
      }

      request.onsuccess = () => {
        resume(Effect.succeed(request.result))
      }
    } else {
      resume(Effect.dieMessage("No key range provided for delete operation"))
    }
  })

/** @internal */
export const getReadonlyObjectStore = (query: IndexedDbQueryBuilder.Select | IndexedDbQueryBuilder.Count) => {
  const database = query.from.database
  const IDBKeyRange = query.from.IDBKeyRange
  const objectStore = database.transaction([query.from.table], "readonly").objectStore(query.from.table)

  let keyRange: globalThis.IDBKeyRange | undefined = undefined
  let store: globalThis.IDBObjectStore | globalThis.IDBIndex

  if (query.only !== undefined) {
    keyRange = IDBKeyRange.only(query.only)
  } else if (query.lowerBound !== undefined && query.upperBound !== undefined) {
    keyRange = IDBKeyRange.bound(
      query.lowerBound,
      query.upperBound,
      query.excludeLowerBound,
      query.excludeUpperBound
    )
  } else if (query.lowerBound !== undefined) {
    keyRange = IDBKeyRange.lowerBound(query.lowerBound, query.excludeLowerBound)
  } else if (query.upperBound !== undefined) {
    keyRange = IDBKeyRange.upperBound(query.upperBound, query.excludeUpperBound)
  }

  if (query.index !== undefined) {
    store = objectStore.index(query.index)
  } else {
    store = objectStore
  }

  return { store, keyRange }
}

/** @internal */
export const getSelect = (query: IndexedDbQueryBuilder.Select) =>
  Effect.gen(function*() {
    const data = yield* Effect.async<any, IndexedDbQuery.IndexedDbQueryError>((resume) => {
      let request: globalThis.IDBRequest
      const { keyRange, store } = getReadonlyObjectStore(query)

      if (query.limitValue !== undefined) {
        const cursorRequest = store.openCursor(keyRange)
        const results: Array<any> = []
        let count = 0

        cursorRequest.onerror = () => {
          resume(
            Effect.fail(
              new IndexedDbQuery.IndexedDbQueryError({ reason: "TransactionError", cause: cursorRequest.error })
            )
          )
        }

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (cursor !== null) {
            results.push(cursor.value)
            count += 1
            if (count < query.limitValue!) {
              cursor.continue()
            } else {
              resume(Effect.succeed(results))
            }
          } else {
            resume(Effect.succeed(results))
          }
        }
      } else {
        request = store.getAll(keyRange)

        request.onerror = (event) => {
          resume(
            Effect.fail(
              new IndexedDbQuery.IndexedDbQueryError({
                reason: "TransactionError",
                cause: event
              })
            )
          )
        }

        request.onsuccess = () => {
          resume(Effect.succeed(request.result))
        }
      }
    })

    const tableSchema = Schema.Array(
      // @ts-expect-error
      query.from.source.tables.pipe(HashMap.unsafeGet(query.from.table), (_) => _.tableSchema)
    )

    return yield* Schema.decodeUnknown(tableSchema)(data).pipe(
      Effect.mapError(
        (error) =>
          new IndexedDbQuery.IndexedDbQueryError({
            reason: "DecodeError",
            cause: error
          })
      )
    )
  })

/** @internal */
export const getFirst = (query: IndexedDbQueryBuilder.First) =>
  Effect.gen(function*() {
    const data = yield* Effect.async<any, IndexedDbQuery.IndexedDbQueryError>((resume) => {
      const { keyRange, store } = getReadonlyObjectStore(query.select)

      if (keyRange !== undefined) {
        const request = store.get(keyRange)

        request.onerror = (event) => {
          resume(
            Effect.fail(
              new IndexedDbQuery.IndexedDbQueryError({
                reason: "TransactionError",
                cause: event
              })
            )
          )
        }

        request.onsuccess = () => {
          resume(Effect.succeed(request.result))
        }
      } else {
        const request = store.openCursor()

        request.onerror = (event) => {
          resume(
            Effect.fail(
              new IndexedDbQuery.IndexedDbQueryError({
                reason: "TransactionError",
                cause: event
              })
            )
          )
        }

        request.onsuccess = () => {
          const value = request.result?.value

          if (value === undefined) {
            resume(
              Effect.fail(
                new IndexedDbQuery.IndexedDbQueryError({
                  reason: "NotFoundError",
                  cause: request.error
                })
              )
            )
          } else {
            resume(Effect.succeed(request.result?.value))
          }
        }
      }
    })

    // @ts-expect-error
    const tableSchema = query.select.from.source.tables.pipe(
      HashMap.unsafeGet(query.select.from.table),
      (_: any) => _.tableSchema
    )

    return yield* Schema.decodeUnknown(tableSchema)(data).pipe(
      Effect.mapError(
        (error) =>
          new IndexedDbQuery.IndexedDbQueryError({
            reason: "DecodeError",
            cause: error
          })
      )
    )
  })

/** @internal */
export const applyModify = (query: IndexedDbQueryBuilder.Modify, value: any) =>
  Effect.async<any, IndexedDbQuery.IndexedDbQueryError>((resume) => {
    const database = query.from.database
    const objectStore = database.transaction([query.from.table], "readwrite").objectStore(query.from.table)

    let request: globalThis.IDBRequest<IDBValidKey>

    if (query.operation === "add") {
      request = objectStore.add(value)
    } else if (query.operation === "put") {
      request = objectStore.put(value)
    } else {
      return resume(Effect.dieMessage("Invalid modify operation"))
    }

    request.onerror = (event) => {
      resume(
        Effect.fail(
          new IndexedDbQuery.IndexedDbQueryError({
            reason: "TransactionError",
            cause: event
          })
        )
      )
    }

    request.onsuccess = () => {
      resume(Effect.succeed(request.result))
    }
  })

/** @internal */
export const applyModifyAll = (query: IndexedDbQueryBuilder.ModifyAll, values: Array<any>) =>
  Effect.async<Array<globalThis.IDBValidKey>, IndexedDbQuery.IndexedDbQueryError>((resume) => {
    const database = query.from.database
    const objectStore = database.transaction([query.from.table], "readwrite").objectStore(query.from.table)

    const results: Array<globalThis.IDBValidKey> = []

    if (query.operation === "add") {
      for (let i = 0; i < values.length; i++) {
        const request = objectStore.add(values[i])

        request.onerror = () => {
          resume(
            Effect.fail(
              new IndexedDbQuery.IndexedDbQueryError({
                reason: "TransactionError",
                cause: request.error
              })
            )
          )
        }

        request.onsuccess = () => {
          results.push(request.result)
        }
      }
    } else if (query.operation === "put") {
      for (let i = 0; i < values.length; i++) {
        const request = objectStore.put(values[i])

        request.onerror = () => {
          resume(
            Effect.fail(
              new IndexedDbQuery.IndexedDbQueryError({
                reason: "TransactionError",
                cause: request.error
              })
            )
          )
        }

        request.onsuccess = () => {
          results.push(request.result)
        }
      }
    } else {
      return resume(Effect.dieMessage("Invalid modify all operation"))
    }

    objectStore.transaction.onerror = () => {
      resume(
        Effect.fail(
          new IndexedDbQuery.IndexedDbQueryError({ reason: "TransactionError", cause: objectStore.transaction.error })
        )
      )
    }

    objectStore.transaction.oncomplete = () => {
      resume(Effect.succeed(results))
    }
  })

/** @internal */
export const applyClear = (query: IndexedDbQueryBuilder.Clear) =>
  Effect.async<void, IndexedDbQuery.IndexedDbQueryError>((resume) => {
    const database = query.from.database
    const objectStore = database.transaction([query.from.table], "readwrite").objectStore(query.from.table)

    const request = objectStore.clear()

    request.onerror = (event) => {
      resume(
        Effect.fail(
          new IndexedDbQuery.IndexedDbQueryError({
            reason: "TransactionError",
            cause: event
          })
        )
      )
    }

    request.onsuccess = () => {
      resume(Effect.void)
    }
  })

/** @internal */
export const applyClearAll = (query: IndexedDbQueryBuilder.ClearAll) =>
  Effect.async<void, IndexedDbQuery.IndexedDbQueryError>((resume) => {
    const database = query.database
    const tables = Array.from(HashMap.keys((query.source as IndexedDbVersion.IndexedDbVersion.AnyWithProps).tables))

    const transaction = database.transaction(tables, "readwrite")

    for (let t = 0; t < tables.length; t++) {
      const objectStore = transaction.objectStore(tables[t])
      const request = objectStore.clear()

      request.onerror = () => {
        resume(
          Effect.fail(new IndexedDbQuery.IndexedDbQueryError({ reason: "TransactionError", cause: request.error }))
        )
      }
    }

    transaction.onerror = () => {
      resume(
        Effect.fail(
          new IndexedDbQuery.IndexedDbQueryError({ reason: "TransactionError", cause: transaction.error })
        )
      )
    }

    transaction.oncomplete = () => {
      resume(Effect.void)
    }
  })

/** @internal */
export const getCount = (query: IndexedDbQueryBuilder.Count) =>
  Effect.async<number, IndexedDbQuery.IndexedDbQueryError>((resume) => {
    const { keyRange, store } = getReadonlyObjectStore(query)

    const request = store.count(keyRange)

    request.onerror = (event) => {
      resume(
        Effect.fail(
          new IndexedDbQuery.IndexedDbQueryError({
            reason: "TransactionError",
            cause: event
          })
        )
      )
    }

    request.onsuccess = () => {
      resume(Effect.succeed(request.result))
    }
  })

/** @internal */
export const fromMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>
>(options: {
  readonly source: Source
  readonly table: Table
  readonly database: globalThis.IDBDatabase
  readonly IDBKeyRange: typeof globalThis.IDBKeyRange
}): IndexedDbQueryBuilder.From<Source, Table> => {
  function IndexedDbQueryBuilder() {}
  Object.setPrototypeOf(IndexedDbQueryBuilder, Proto)
  IndexedDbQueryBuilder.source = options.source
  IndexedDbQueryBuilder.table = options.table
  IndexedDbQueryBuilder.database = options.database
  IndexedDbQueryBuilder.IDBKeyRange = options.IDBKeyRange

  IndexedDbQueryBuilder.select = <
    Index extends IndexedDbMigration.IndexFromTable<Source, Table>
  >(index?: Index) =>
    selectMakeProto({
      from: IndexedDbQueryBuilder as any,
      // @ts-expect-error
      index
    })

  IndexedDbQueryBuilder.delete = <
    Index extends IndexedDbMigration.IndexFromTable<Source, Table>
  >(index?: Index) =>
    deletePartialMakeProto({
      from: IndexedDbQueryBuilder as any,
      // @ts-expect-error
      index
    })

  IndexedDbQueryBuilder.count = <
    Index extends IndexedDbMigration.IndexFromTable<Source, Table>
  >(index?: Index) =>
    countMakeProto({
      from: IndexedDbQueryBuilder as any,
      // @ts-expect-error
      index
    })

  IndexedDbQueryBuilder.insert = (value: any) =>
    modifyMakeProto({ from: IndexedDbQueryBuilder as any, value, operation: "add" })

  IndexedDbQueryBuilder.upsert = (value: any) =>
    modifyMakeProto({ from: IndexedDbQueryBuilder as any, value, operation: "put" })

  IndexedDbQueryBuilder.insertAll = (values: Array<any>) =>
    modifyAllMakeProto({ from: IndexedDbQueryBuilder as any, values, operation: "add" })

  IndexedDbQueryBuilder.upsertAll = (values: Array<any>) =>
    modifyAllMakeProto({ from: IndexedDbQueryBuilder as any, values, operation: "put" })

  IndexedDbQueryBuilder.clear = clearMakeProto({ from: IndexedDbQueryBuilder as any })

  return IndexedDbQueryBuilder as any
}

/** @internal */
export const deletePartialMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>,
  Index extends IndexedDbMigration.IndexFromTable<Source, Table>
>(options: {
  readonly from: IndexedDbQueryBuilder.From<Source, Table>
  readonly index: Index | undefined
}): IndexedDbQueryBuilder.DeletePartial<Source, Table, Index> => {
  function IndexedDbQueryBuilderImpl() {}

  const limit = (
    limit: number
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({ delete: IndexedDbQueryBuilderImpl as any, limitValue: limit })

  const equals = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({ delete: IndexedDbQueryBuilderImpl as any, only: value })

  const gte = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: IndexedDbQueryBuilderImpl as any,
      lowerBound: value,
      excludeLowerBound: false
    })

  const lte = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: IndexedDbQueryBuilderImpl as any,
      upperBound: value,
      excludeUpperBound: false
    })

  const gt = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: IndexedDbQueryBuilderImpl as any,
      lowerBound: value,
      excludeLowerBound: true
    })

  const lt = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: IndexedDbQueryBuilderImpl as any,
      upperBound: value,
      excludeUpperBound: true
    })

  const between = (
    lowerBound: ExtractIndexType<Source, Table, Index>,
    upperBound: ExtractIndexType<Source, Table, Index>,
    queryOptions?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: IndexedDbQueryBuilderImpl as any,
      lowerBound,
      upperBound,
      excludeLowerBound: queryOptions?.excludeLowerBound ?? false,
      excludeUpperBound: queryOptions?.excludeUpperBound ?? false
    })

  Object.setPrototypeOf(IndexedDbQueryBuilderImpl, Object.assign(Object.create(BasicProto)))
  IndexedDbQueryBuilderImpl.from = options.from
  IndexedDbQueryBuilderImpl.index = options.index
  IndexedDbQueryBuilderImpl.equals = equals
  IndexedDbQueryBuilderImpl.gte = gte
  IndexedDbQueryBuilderImpl.lte = lte
  IndexedDbQueryBuilderImpl.gt = gt
  IndexedDbQueryBuilderImpl.lt = lt
  IndexedDbQueryBuilderImpl.between = between
  IndexedDbQueryBuilderImpl.limit = limit
  return IndexedDbQueryBuilderImpl as any
}

/** @internal */
export const deleteMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>,
  Index extends IndexedDbMigration.IndexFromTable<Source, Table>
>(options: {
  readonly delete: IndexedDbQueryBuilder.DeletePartial<Source, Table, Index>
  readonly limitValue?: number | undefined
  readonly only?: ExtractIndexType<Source, Table, Index>
  readonly lowerBound?: ExtractIndexType<Source, Table, Index>
  readonly upperBound?: ExtractIndexType<Source, Table, Index>
  readonly excludeLowerBound?: boolean
  readonly excludeUpperBound?: boolean
}): IndexedDbQueryBuilder.Delete<Source, Table, Index> => {
  function IndexedDbQueryBuilderImpl() {}

  const limit = (
    limit: number
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: options.delete,
      only: options.only,
      lowerBound: options.lowerBound,
      upperBound: options.upperBound,
      excludeLowerBound: options.excludeLowerBound ?? false,
      excludeUpperBound: options.excludeUpperBound ?? false,
      limitValue: limit
    })

  const equals = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({ delete: options.delete, only: value, limitValue: options.limitValue })

  const gte = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: options.delete,
      lowerBound: value,
      excludeLowerBound: false,
      limitValue: options.limitValue
    })

  const lte = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: options.delete,
      upperBound: value,
      excludeUpperBound: false,
      limitValue: options.limitValue
    })

  const gt = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: options.delete,
      lowerBound: value,
      excludeLowerBound: true,
      limitValue: options.limitValue
    })

  const lt = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: options.delete,
      upperBound: value,
      excludeUpperBound: true,
      limitValue: options.limitValue
    })

  const between = (
    lowerBound: ExtractIndexType<Source, Table, Index>,
    upperBound: ExtractIndexType<Source, Table, Index>,
    queryOptions?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
  ): IndexedDbQueryBuilder.Delete<Source, Table, Index> =>
    deleteMakeProto({
      delete: options.delete,
      lowerBound,
      upperBound,
      excludeLowerBound: queryOptions?.excludeLowerBound ?? false,
      excludeUpperBound: queryOptions?.excludeUpperBound ?? false,
      limitValue: options.limitValue
    })

  Object.setPrototypeOf(
    IndexedDbQueryBuilderImpl,
    Object.assign(Object.create(Proto), {
      commit(this: IndexedDbQueryBuilder.Delete) {
        return applyDelete(this)
      }
    })
  )
  IndexedDbQueryBuilderImpl.delete = options.delete
  IndexedDbQueryBuilderImpl.limitValue = options.limitValue
  IndexedDbQueryBuilderImpl.only = options.only
  IndexedDbQueryBuilderImpl.lowerBound = options.lowerBound
  IndexedDbQueryBuilderImpl.upperBound = options.upperBound
  IndexedDbQueryBuilderImpl.excludeLowerBound = options.excludeLowerBound
  IndexedDbQueryBuilderImpl.excludeUpperBound = options.excludeUpperBound
  IndexedDbQueryBuilderImpl.equals = equals
  IndexedDbQueryBuilderImpl.gte = gte
  IndexedDbQueryBuilderImpl.lte = lte
  IndexedDbQueryBuilderImpl.gt = gt
  IndexedDbQueryBuilderImpl.lt = lt
  IndexedDbQueryBuilderImpl.between = between
  IndexedDbQueryBuilderImpl.limit = limit
  return IndexedDbQueryBuilderImpl as any
}

/** @internal */
export const countMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>,
  Index extends IndexedDbMigration.IndexFromTable<Source, Table>
>(options: {
  readonly from: IndexedDbQueryBuilder.From<Source, Table>
  readonly index: Index | undefined
  readonly limitValue: number | undefined
  readonly only?: ExtractIndexType<Source, Table, Index>
  readonly lowerBound?: ExtractIndexType<Source, Table, Index>
  readonly upperBound?: ExtractIndexType<Source, Table, Index>
  readonly excludeLowerBound?: boolean
  readonly excludeUpperBound?: boolean
}): IndexedDbQueryBuilder.Count<Source, Table, Index> => {
  function IndexedDbQueryBuilderImpl() {}

  const limit = (
    limit: number
  ): IndexedDbQueryBuilder.Count<Source, Table, Index> =>
    countMakeProto({
      from: options.from,
      index: options.index,
      only: options.only,
      lowerBound: options.lowerBound,
      upperBound: options.upperBound,
      excludeLowerBound: options.excludeLowerBound ?? false,
      excludeUpperBound: options.excludeUpperBound ?? false,
      limitValue: limit
    })

  const equals = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Count<Source, Table, Index> =>
    countMakeProto({ from: options.from, index: options.index, only: value, limitValue: options.limitValue })

  const gte = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Count<Source, Table, Index> =>
    countMakeProto({
      from: options.from,
      index: options.index,
      lowerBound: value,
      excludeLowerBound: false,
      limitValue: options.limitValue
    })

  const lte = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Count<Source, Table, Index> =>
    countMakeProto({
      from: options.from,
      index: options.index,
      upperBound: value,
      excludeUpperBound: false,
      limitValue: options.limitValue
    })

  const gt = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Count<Source, Table, Index> =>
    countMakeProto({
      from: options.from,
      index: options.index,
      lowerBound: value,
      excludeLowerBound: true,
      limitValue: options.limitValue
    })

  const lt = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Count<Source, Table, Index> =>
    countMakeProto({
      from: options.from,
      index: options.index,
      upperBound: value,
      excludeUpperBound: true,
      limitValue: options.limitValue
    })

  const between = (
    lowerBound: ExtractIndexType<Source, Table, Index>,
    upperBound: ExtractIndexType<Source, Table, Index>,
    queryOptions?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
  ): IndexedDbQueryBuilder.Count<Source, Table, Index> =>
    countMakeProto({
      from: options.from,
      index: options.index,
      lowerBound,
      upperBound,
      excludeLowerBound: queryOptions?.excludeLowerBound ?? false,
      excludeUpperBound: queryOptions?.excludeUpperBound ?? false,
      limitValue: options.limitValue
    })

  Object.setPrototypeOf(
    IndexedDbQueryBuilderImpl,
    Object.assign(Object.create(Proto), {
      commit(this: IndexedDbQueryBuilder.Count) {
        return getCount(this)
      }
    })
  )
  IndexedDbQueryBuilderImpl.from = options.from
  IndexedDbQueryBuilderImpl.index = options.index
  IndexedDbQueryBuilderImpl.only = options.only
  IndexedDbQueryBuilderImpl.limitValue = options.limitValue
  IndexedDbQueryBuilderImpl.lowerBound = options.lowerBound
  IndexedDbQueryBuilderImpl.upperBound = options.upperBound
  IndexedDbQueryBuilderImpl.excludeLowerBound = options.excludeLowerBound
  IndexedDbQueryBuilderImpl.excludeUpperBound = options.excludeUpperBound
  IndexedDbQueryBuilderImpl.equals = equals
  IndexedDbQueryBuilderImpl.gte = gte
  IndexedDbQueryBuilderImpl.lte = lte
  IndexedDbQueryBuilderImpl.gt = gt
  IndexedDbQueryBuilderImpl.lt = lt
  IndexedDbQueryBuilderImpl.between = between
  IndexedDbQueryBuilderImpl.limit = limit
  return IndexedDbQueryBuilderImpl as any
}

/** @internal */
export const selectMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>,
  Index extends IndexedDbMigration.IndexFromTable<Source, Table>
>(options: {
  readonly from: IndexedDbQueryBuilder.From<Source, Table>
  readonly index: Index | undefined
  readonly limitValue: number | undefined
  readonly only?: ExtractIndexType<Source, Table, Index>
  readonly lowerBound?: ExtractIndexType<Source, Table, Index>
  readonly upperBound?: ExtractIndexType<Source, Table, Index>
  readonly excludeLowerBound?: boolean
  readonly excludeUpperBound?: boolean
}): IndexedDbQueryBuilder.Select<Source, Table, Index> => {
  function IndexedDbQueryBuilderImpl() {}

  const limit = (
    limit: number
  ): IndexedDbQueryBuilder.Select<Source, Table, Index> =>
    selectMakeProto({
      from: options.from,
      index: options.index,
      only: options.only,
      lowerBound: options.lowerBound,
      upperBound: options.upperBound,
      excludeLowerBound: options.excludeLowerBound ?? false,
      excludeUpperBound: options.excludeUpperBound ?? false,
      limitValue: limit
    })

  const equals = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Select<Source, Table, Index> =>
    selectMakeProto({ from: options.from, index: options.index, only: value, limitValue: options.limitValue })

  const gte = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Select<Source, Table, Index> =>
    selectMakeProto({
      from: options.from,
      index: options.index,
      lowerBound: value,
      excludeLowerBound: false,
      limitValue: options.limitValue
    })

  const lte = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Select<Source, Table, Index> =>
    selectMakeProto({
      from: options.from,
      index: options.index,
      upperBound: value,
      excludeUpperBound: false,
      limitValue: options.limitValue
    })

  const gt = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Select<Source, Table, Index> =>
    selectMakeProto({
      from: options.from,
      index: options.index,
      lowerBound: value,
      excludeLowerBound: true,
      limitValue: options.limitValue
    })

  const lt = (
    value: ExtractIndexType<Source, Table, Index>
  ): IndexedDbQueryBuilder.Select<Source, Table, Index> =>
    selectMakeProto({
      from: options.from,
      index: options.index,
      upperBound: value,
      excludeUpperBound: true,
      limitValue: options.limitValue
    })

  const between = (
    lowerBound: ExtractIndexType<Source, Table, Index>,
    upperBound: ExtractIndexType<Source, Table, Index>,
    queryOptions?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
  ): IndexedDbQueryBuilder.Select<Source, Table, Index> =>
    selectMakeProto({
      from: options.from,
      index: options.index,
      lowerBound,
      upperBound,
      excludeLowerBound: queryOptions?.excludeLowerBound ?? false,
      excludeUpperBound: queryOptions?.excludeUpperBound ?? false,
      limitValue: options.limitValue
    })

  const first = (): IndexedDbQueryBuilder.First<Source, Table, Index> =>
    firstMakeProto({ select: IndexedDbQueryBuilderImpl as any })

  Object.setPrototypeOf(
    IndexedDbQueryBuilderImpl,
    Object.assign(Object.create(Proto), {
      commit(this: IndexedDbQueryBuilder.Select) {
        return getSelect(this)
      }
    })
  )
  IndexedDbQueryBuilderImpl.from = options.from
  IndexedDbQueryBuilderImpl.index = options.index
  IndexedDbQueryBuilderImpl.only = options.only
  IndexedDbQueryBuilderImpl.limitValue = options.limitValue
  IndexedDbQueryBuilderImpl.lowerBound = options.lowerBound
  IndexedDbQueryBuilderImpl.upperBound = options.upperBound
  IndexedDbQueryBuilderImpl.excludeLowerBound = options.excludeLowerBound
  IndexedDbQueryBuilderImpl.excludeUpperBound = options.excludeUpperBound
  IndexedDbQueryBuilderImpl.equals = equals
  IndexedDbQueryBuilderImpl.gte = gte
  IndexedDbQueryBuilderImpl.lte = lte
  IndexedDbQueryBuilderImpl.gt = gt
  IndexedDbQueryBuilderImpl.lt = lt
  IndexedDbQueryBuilderImpl.between = between
  IndexedDbQueryBuilderImpl.limit = limit
  IndexedDbQueryBuilderImpl.first = first
  return IndexedDbQueryBuilderImpl as any
}

/** @internal */
export const firstMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>,
  Index extends IndexedDbMigration.IndexFromTable<Source, Table>
>(options: {
  readonly select: IndexedDbQueryBuilder.Select<Source, Table, Index>
}): IndexedDbQueryBuilder.First<Source, Table, Index> => {
  function IndexedDbQueryBuilderImpl() {}

  Object.setPrototypeOf(
    IndexedDbQueryBuilderImpl,
    Object.assign(Object.create(Proto), {
      commit(this: IndexedDbQueryBuilder.First) {
        return getFirst(this)
      }
    })
  )
  IndexedDbQueryBuilderImpl.select = options.select
  return IndexedDbQueryBuilderImpl as any
}

/** @internal */
export const modifyMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>
>(options: {
  readonly from: IndexedDbQueryBuilder.From<Source, Table>
  readonly value: Schema.Schema.Type<
    IndexedDbTable.IndexedDbTable.TableSchema<
      IndexedDbTable.IndexedDbTable.WithName<
        IndexedDbVersion.IndexedDbVersion.Tables<Source>,
        Table
      >
    >
  >
  readonly operation: "add" | "put"
}): IndexedDbQueryBuilder.Modify<Source, Table> => {
  function IndexedDbQueryBuilderImpl() {}

  Object.setPrototypeOf(
    IndexedDbQueryBuilderImpl,
    Object.assign(Object.create(Proto), {
      commit(this: IndexedDbQueryBuilder.Modify) {
        return applyModify(this, options.value)
      }
    })
  )
  IndexedDbQueryBuilderImpl.from = options.from
  IndexedDbQueryBuilderImpl.value = options.value
  IndexedDbQueryBuilderImpl.operation = options.operation
  return IndexedDbQueryBuilderImpl as any
}

/** @internal */
export const modifyAllMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>
>(options: {
  readonly from: IndexedDbQueryBuilder.From<Source, Table>
  readonly values: Array<
    Schema.Schema.Type<
      IndexedDbTable.IndexedDbTable.TableSchema<
        IndexedDbTable.IndexedDbTable.WithName<
          IndexedDbVersion.IndexedDbVersion.Tables<Source>,
          Table
        >
      >
    >
  >
  readonly operation: "add" | "put"
}): IndexedDbQueryBuilder.Modify<Source, Table> => {
  function IndexedDbQueryBuilderImpl() {}

  Object.setPrototypeOf(
    IndexedDbQueryBuilderImpl,
    Object.assign(Object.create(Proto), {
      commit(this: IndexedDbQueryBuilder.ModifyAll) {
        return applyModifyAll(this, options.values)
      }
    })
  )
  IndexedDbQueryBuilderImpl.from = options.from
  IndexedDbQueryBuilderImpl.values = options.values
  IndexedDbQueryBuilderImpl.operation = options.operation
  return IndexedDbQueryBuilderImpl as any
}

/** @internal */
export const clearMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps,
  Table extends IndexedDbTable.IndexedDbTable.TableName<IndexedDbVersion.IndexedDbVersion.Tables<Source>>
>(options: {
  readonly from: IndexedDbQueryBuilder.From<Source, Table>
}): IndexedDbQueryBuilder.Clear<Source, Table> => {
  function IndexedDbQueryBuilderImpl() {}

  Object.setPrototypeOf(
    IndexedDbQueryBuilderImpl,
    Object.assign(Object.create(Proto), {
      commit(this: IndexedDbQueryBuilder.Clear) {
        return applyClear(this)
      }
    })
  )
  IndexedDbQueryBuilderImpl.from = options.from
  return IndexedDbQueryBuilderImpl as any
}

/** @internal */
export const clearAllMakeProto = <
  Source extends IndexedDbVersion.IndexedDbVersion.AnyWithProps
>(options: {
  readonly source: Source
  readonly database: globalThis.IDBDatabase
}): IndexedDbQueryBuilder.ClearAll<Source> => {
  function IndexedDbQueryBuilderImpl() {}

  Object.setPrototypeOf(
    IndexedDbQueryBuilderImpl,
    Object.assign(Object.create(Proto), {
      commit(this: IndexedDbQueryBuilder.ClearAll) {
        return applyClearAll(this)
      }
    })
  )
  IndexedDbQueryBuilderImpl.database = options.database
  IndexedDbQueryBuilderImpl.source = options.source
  return IndexedDbQueryBuilderImpl as any
}
