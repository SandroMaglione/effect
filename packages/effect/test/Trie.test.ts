import { deepStrictEqual } from "effect-test/util"
import * as Equal from "effect/Equal"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Trie from "effect/Trie"
import { assert, describe, expect, it } from "vitest"

describe("Trie", () => {
  it("toString", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("a", 0),
      Trie.insert("b", 1)
    )

    expect(String(trie)).toEqual(`{
  "_id": "Trie",
  "values": [
    [
      "a",
      0
    ],
    [
      "b",
      1
    ]
  ]
}`)
  })

  it("toJSON", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("a", 0),
      Trie.insert("b", 1)
    )

    expect(trie.toJSON()).toEqual(
      { _id: "Trie", values: [["a", 0], ["b", 1]] }
    )
  })

  it("inspect", () => {
    if (typeof window !== "undefined") {
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { inspect } = require("node:util")

    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("a", 0),
      Trie.insert("b", 1)
    )

    expect(inspect(trie)).toEqual(inspect({ _id: "Trie", values: [["a", 0], ["b", 1]] }))
  })

  it("iterable empty", () => {
    const trie = pipe(Trie.empty<string>())

    assert.strictEqual(Trie.size(trie), 0)
    deepStrictEqual(Array.from(trie), [])
  })

  it("insert", () => {
    const trie1 = pipe(
      Trie.empty<number>(),
      Trie.insert("call", 0)
    )

    const trie2 = trie1.pipe(Trie.insert("me", 1))
    const trie3 = trie2.pipe(Trie.insert("mind", 2))
    const trie4 = trie3.pipe(Trie.insert("mid", 3))

    deepStrictEqual(Array.from(trie1), [["call", 0]])
    deepStrictEqual(Array.from(trie2), [["call", 0], ["me", 1]])
    deepStrictEqual(Array.from(trie3), [["call", 0], ["me", 1], ["mind", 2]])
    deepStrictEqual(Array.from(trie4), [["call", 0], ["me", 1], ["mind", 2], ["mid", 3]])
  })

  it("fromIterable empty", () => {
    const iterable: Array<[string, number]> = []
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
  })

  it("fromIterable [1]", () => {
    const iterable: Array<[string, number]> = [["ca", 0], ["me", 1]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
  })

  it("fromIterable [2]", () => {
    const iterable: Array<[string, number]> = [["call", 0], ["me", 1], ["mind", 2], ["mid", 3]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
  })

  it("fromIterable [3]", () => {
    const iterable: Array<[string, number]> = [["a", 0], ["b", 1]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
  })

  it("fromIterable [4]", () => {
    const iterable: Array<[string, number]> = [["a", 0]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), iterable)
  })

  it("fromIterable [5]", () => {
    const iterable: Array<[string, number]> = [["shells", 0], ["she", 1]]
    const trie = Trie.fromIterable(iterable)
    deepStrictEqual(Array.from(trie), [["she", 1], ["shells", 0]])
  })

  it("size", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("a", 0),
      Trie.insert("b", 1)
    )
    expect(Trie.size(trie)).toBe(2)
  })

  it("get", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("call", 0),
      Trie.insert("me", 1),
      Trie.insert("mind", 2),
      Trie.insert("mid", 3)
    )
    deepStrictEqual(Trie.get(trie, "call"), Option.some(0))
    deepStrictEqual(Trie.get(trie, "me"), Option.some(1))
    deepStrictEqual(Trie.get(trie, "mind"), Option.some(2))
    deepStrictEqual(Trie.get(trie, "mid"), Option.some(3))
    deepStrictEqual(Trie.get(trie, "cale"), Option.none())
    deepStrictEqual(Trie.get(trie, "ma"), Option.none())
    deepStrictEqual(Trie.get(trie, "midn"), Option.none())
    deepStrictEqual(Trie.get(trie, "mea"), Option.none())
  })

  it("unsafeGet", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("call", 0),
      Trie.insert("me", 1)
    )

    assert.throws(() => Trie.unsafeGet(trie, "mae"))
  })

  it("remove", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("call", 0),
      Trie.insert("me", 1),
      Trie.insert("mind", 2),
      Trie.insert("mid", 3)
    )

    const trie1 = trie.pipe(Trie.remove("call"))
    const trie2 = trie1.pipe(Trie.remove("mea"))

    deepStrictEqual(Trie.get(trie, "call"), Option.some(0))
    deepStrictEqual(Trie.get(trie1, "call"), Option.none())
    deepStrictEqual(Trie.get(trie2, "call"), Option.none())

    deepStrictEqual(Array.from(trie), [["call", 0], ["me", 1], ["mind", 2], ["mid", 3]])
    deepStrictEqual(Array.from(trie1), [["me", 1], ["mind", 2], ["mid", 3]])
    deepStrictEqual(Array.from(trie2), [["me", 1], ["mind", 2], ["mid", 3]])
  })

  it("keys", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("call", 0),
      Trie.insert("me", 1)
    )

    const result = Array.from(Trie.keys(trie))
    deepStrictEqual(result, ["call", "me"])
  })

  it("values", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("call", 0),
      Trie.insert("me", 1)
    )

    const result = Array.from(Trie.values(trie))
    deepStrictEqual(result, [0, 1])
  })

  it("entries", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("call", 0),
      Trie.insert("me", 1)
    )

    const result = Array.from(Trie.entries(trie))
    deepStrictEqual(result, [["call", 0], ["me", 1]])
  })

  it("toEntries", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("call", 0),
      Trie.insert("me", 1)
    )

    const result = Trie.toEntries(trie)
    deepStrictEqual(result, [["call", 0], ["me", 1]])
  })

  it("keysWithPrefix", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("sea", 2),
      Trie.insert("she", 3)
    )

    const result = Array.from(Trie.keysWithPrefix(trie, "she"))
    deepStrictEqual(result, ["she", "shells"])
  })

  it("valuesWithPrefix", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("sea", 2),
      Trie.insert("she", 3)
    )

    const result = Array.from(Trie.valuesWithPrefix(trie, "she"))
    deepStrictEqual(result, [3, 0])
  })

  it("entriesWithPrefix", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("sea", 2),
      Trie.insert("she", 3)
    )

    const result = Array.from(Trie.entriesWithPrefix(trie, "she"))
    deepStrictEqual(result, [["she", 3], ["shells", 0]])
  })

  it("toEntriesWithPrefix", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("sea", 2),
      Trie.insert("she", 3)
    )

    const result = Trie.toEntriesWithPrefix(trie, "she")
    deepStrictEqual(result, [["she", 3], ["shells", 0]])
  })

  it("longestPrefixOf", () => {
    const trie = pipe(
      Trie.empty<number>(),
      Trie.insert("shells", 0),
      Trie.insert("sells", 1),
      Trie.insert("she", 2)
    )

    deepStrictEqual(Trie.longestPrefixOf(trie, "sell"), Option.none())
    deepStrictEqual(Trie.longestPrefixOf(trie, "sells"), Option.some(["sells", 1]))
    deepStrictEqual(Trie.longestPrefixOf(trie, "shell"), Option.some(["she", 2]))
    deepStrictEqual(Trie.longestPrefixOf(trie, "shellsort"), Option.some(["shells", 0]))
  })

  it("Equal.symbol", () => {
    expect(
      Equal.equals(Trie.empty<number>(), Trie.empty<number>())
    ).toBe(true)
    expect(
      Equal.equals(
        Trie.make(["call", 0], ["me", 1]),
        Trie.make(["call", 0], ["me", 1])
      )
    ).toBe(true)
  })
})
