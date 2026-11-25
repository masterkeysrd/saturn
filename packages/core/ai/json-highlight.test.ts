import { describe, expect, it } from "vitest"
import { prettifyJsonValue, tokenizeJson, type JsonSyntaxToken } from "./index"

describe("@saturn/core/ai json-highlight", () => {
  describe("prettifyJsonValue", () => {
    it.each([
      {
        name: "pretty-prints a plain object",
        input: { a: 1, b: "two", ok: true },
        expected: '{\n  "a": 1,\n  "b": "two",\n  "ok": true\n}',
      },
      {
        name: "parses and pretty-prints a JSON object string with surrounding whitespace",
        input: '   {"id":"acc_1","balance":1250}  ',
        expected: '{\n  "id": "acc_1",\n  "balance": 1250\n}',
      },
      {
        name: "parses and pretty-prints a JSON array string",
        input: '[{"name":"Checking"},{"name":"Savings"}]',
        expected:
          '[\n  {\n    "name": "Checking"\n  },\n  {\n    "name": "Savings"\n  }\n]',
      },
      {
        name: "returns raw string for non-JSON text",
        input: "Account created successfully.",
        expected: "Account created successfully.",
      },
      {
        name: "returns raw string for primitive JSON string values (number/boolean)",
        input: "42",
        expected: "42",
      },
      {
        name: "returns raw string for invalid JSON starting with brace",
        input: "{not valid json}",
        expected: "{not valid json}",
      },
      {
        name: "formats null and undefined safely",
        input: null,
        expected: "null",
      },
      {
        name: "returns empty string for undefined",
        input: undefined,
        expected: "",
      },
      {
        name: "unwraps nested MCP content text JSON strings by default",
        input: {
          content: [
            {
              type: "text",
              text: '{"accounts":[{"id":"acc_1","name":"Checking"}]}',
            },
          ],
          isError: false,
        },
        expected: JSON.stringify(
          {
            content: [
              {
                type: "text",
                text: {
                  accounts: [{ id: "acc_1", name: "Checking" }],
                },
              },
            ],
            isError: false,
          },
          null,
          2
        ),
      },
      {
        name: "unwraps doubly-nested JSON strings recursively",
        input: JSON.stringify({
          outer: JSON.stringify({
            inner: JSON.stringify([1, 2, 3]),
          }),
        }),
        expected: JSON.stringify(
          {
            outer: {
              inner: [1, 2, 3],
            },
          },
          null,
          2
        ),
      },
      {
        name: "leaves non-object/non-array JSON-like strings untouched",
        input: { note: "123", flag: "true", empty: "{broken" },
        expected: JSON.stringify(
          { note: "123", flag: "true", empty: "{broken" },
          null,
          2
        ),
      },
    ])("$name", ({ input, expected }) => {
      expect(prettifyJsonValue(input)).toBe(expected)
    })

    it("preserves nested JSON strings when unwrapNestedJsonStrings is false", () => {
      const mcpPayload = {
        content: [{ type: "text", text: '{"accounts":[1,2]}' }],
      }
      expect(
        prettifyJsonValue(mcpPayload, { unwrapNestedJsonStrings: false })
      ).toBe(JSON.stringify(mcpPayload, null, 2))
    })

    it("caps nested JSON string unwrapping at depth <= 8", () => {
      let deep: Record<string, unknown> = {
        leaf: '{"shouldNotUnwrap":true}',
      }
      for (let i = 0; i < 9; i++) {
        deep = { nested: deep }
      }
      const formatted = prettifyJsonValue(deep)
      expect(formatted).toContain('"{\\"shouldNotUnwrap\\":true}"')
    })
  })

  describe("tokenizeJson", () => {
    it("returns empty array for empty input", () => {
      expect(tokenizeJson("")).toEqual([])
    })

    it("falls back to single plain token when input exceeds maxLength", () => {
      const big = '{"key": "value"}'
      expect(tokenizeJson(big, { maxLength: 5 })).toEqual([
        { type: "plain", value: big },
      ])
    })

    it.each<{
      name: string
      input: string
      expectedNonWhitespace: JsonSyntaxToken[]
    }>([
      {
        name: "distinguishes keys from string values",
        input: '{\n  "name": "Alice",\n  "city": "New York"\n}',
        expectedNonWhitespace: [
          { type: "punctuation", value: "{" },
          { type: "key", value: '"name"' },
          { type: "punctuation", value: ":" },
          { type: "string", value: '"Alice"' },
          { type: "punctuation", value: "," },
          { type: "key", value: '"city"' },
          { type: "punctuation", value: ":" },
          { type: "string", value: '"New York"' },
          { type: "punctuation", value: "}" },
        ],
      },
      {
        name: "handles escaped quotes and backslashes inside keys and strings",
        input: '{"a\\"b": "c\\\\d", "trail\\\\": "end\\""}',
        expectedNonWhitespace: [
          { type: "punctuation", value: "{" },
          { type: "key", value: '"a\\"b"' },
          { type: "punctuation", value: ":" },
          { type: "string", value: '"c\\\\d"' },
          { type: "punctuation", value: "," },
          { type: "key", value: '"trail\\\\"' },
          { type: "punctuation", value: ":" },
          { type: "string", value: '"end\\""' },
          { type: "punctuation", value: "}" },
        ],
      },
      {
        name: "tokenizes negative, decimal, and scientific notation numbers",
        input: "[0, -42, 3.14159, -0.5e+10, 1E-3]",
        expectedNonWhitespace: [
          { type: "punctuation", value: "[" },
          { type: "number", value: "0" },
          { type: "punctuation", value: "," },
          { type: "number", value: "-42" },
          { type: "punctuation", value: "," },
          { type: "number", value: "3.14159" },
          { type: "punctuation", value: "," },
          { type: "number", value: "-0.5e+10" },
          { type: "punctuation", value: "," },
          { type: "number", value: "1E-3" },
          { type: "punctuation", value: "]" },
        ],
      },
      {
        name: "tokenizes booleans and null at word boundaries",
        input: '{"ok": true, "fail": false, "empty": null}',
        expectedNonWhitespace: [
          { type: "punctuation", value: "{" },
          { type: "key", value: '"ok"' },
          { type: "punctuation", value: ":" },
          { type: "boolean", value: "true" },
          { type: "punctuation", value: "," },
          { type: "key", value: '"fail"' },
          { type: "punctuation", value: ":" },
          { type: "boolean", value: "false" },
          { type: "punctuation", value: "," },
          { type: "key", value: '"empty"' },
          { type: "punctuation", value: ":" },
          { type: "null", value: "null" },
          { type: "punctuation", value: "}" },
        ],
      },
      {
        name: "emits plain tokens for non-JSON identifiers without splitting boolean/null prefixes",
        input: "trueStory nullable 123abc -foo",
        expectedNonWhitespace: [
          { type: "plain", value: "trueStory" },
          { type: "plain", value: "nullable" },
          { type: "plain", value: "123abc" },
          { type: "plain", value: "-foo" },
        ],
      },
    ])("$name", ({ input, expectedNonWhitespace }) => {
      const tokens = tokenizeJson(input)
      expect(tokens.map((t) => t.value).join("")).toBe(input)
      expect(tokens.filter((t) => t.type !== "whitespace")).toEqual(
        expectedNonWhitespace
      )
    })

    it("maintains lossless round-trip concatenation on prettified MCP payloads", () => {
      const pretty = prettifyJsonValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              accounts: [
                {
                  id: "acc_1",
                  balance: -125.5e1,
                  active: true,
                  closedAt: null,
                },
              ],
            }),
          },
        ],
      })
      const tokens = tokenizeJson(pretty)
      expect(tokens.map((t) => t.value).join("")).toBe(pretty)
      expect(tokens.some((t) => t.type === "key")).toBe(true)
      expect(tokens.some((t) => t.type === "string")).toBe(true)
      expect(tokens.some((t) => t.type === "number")).toBe(true)
      expect(tokens.some((t) => t.type === "boolean")).toBe(true)
      expect(tokens.some((t) => t.type === "null")).toBe(true)
      expect(tokens.some((t) => t.type === "punctuation")).toBe(true)
      expect(tokens.some((t) => t.type === "whitespace")).toBe(true)
    })
  })
})
