import * as S from "effect/Schema"
import * as Util from "effect/test/Schema/TestUtils"
import { describe, it } from "vitest"

describe("BooleanFromString", () => {
  const schema = S.BooleanFromString
  it("decoding", async () => {
    await Util.expectDecodeUnknownSuccess(schema, "true", true)
    await Util.expectDecodeUnknownSuccess(schema, "false", false)
  })

  it("encoding", async () => {
    await Util.expectEncodeSuccess(schema, true, "true")
    await Util.expectEncodeSuccess(schema, false, "false")
  })
})
