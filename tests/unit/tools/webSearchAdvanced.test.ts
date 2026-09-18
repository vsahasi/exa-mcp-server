import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { searchResponse } from "../../fixtures/exaResponses.js";
import { FakeMcpServer } from "../../helpers/fakeMcpServer.js";

const { ExaMock, requestMock } = vi.hoisted(() => {
  const requestMock = vi.fn();
  class ExaMock {
    request = requestMock;
  }

  return {
    ExaMock,
    requestMock,
  };
});

vi.mock("exa-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("exa-js")>()),
  Exa: ExaMock,
}));

vi.mock("agnost", () => ({
  checkpoint: vi.fn(),
}));

// Values the Exa /search reference and exa-js 2.22 accept for `category`.
// `pdf` and `github` were deprecated in the 2026-07-23 changelog and no
// longer appear in either.
const SUPPORTED_CATEGORIES = [
  "company",
  "publication",
  "news",
  "personal site",
  "people",
  "financial report",
];

const loadTool = () => import("../../../src/tools/webSearchAdvanced.js");

describe("registerWebSearchAdvancedTool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("does not expose filters the Exa API ignores", async () => {
    const { registerWebSearchAdvancedTool } = await loadTool();
    const server = new FakeMcpServer();

    registerWebSearchAdvancedTool(server as any, { exaApiKey: "test-key" });

    const schema = server.getTool("web_search_advanced_exa").inputSchema as z.ZodRawShape;

    // startCrawlDate / endCrawlDate: "Deprecated and has no effect; ignored by the API."
    expect(schema).not.toHaveProperty("startCrawlDate");
    expect(schema).not.toHaveProperty("endCrawlDate");
    expect(schema).toHaveProperty("startPublishedDate");
    expect(schema).toHaveProperty("endPublishedDate");

    const category = schema.category as z.ZodOptional<z.ZodEnum<[string, ...string[]]>>;
    expect(category.unwrap().options).toEqual(SUPPORTED_CATEGORIES);
  });

  it("does not forward legacy crawl-date arguments to Exa", async () => {
    const { registerWebSearchAdvancedTool } = await loadTool();
    const server = new FakeMcpServer();
    requestMock.mockResolvedValue(searchResponse);

    registerWebSearchAdvancedTool(server as any, { exaApiKey: "test-key" });

    // A client built against an older schema may still send these.
    await server.getTool("web_search_advanced_exa").handler({
      query: "AI breakthroughs",
      startPublishedDate: "2026-01-01",
      startCrawlDate: "2026-01-01",
      endCrawlDate: "2026-02-01",
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
    const body = requestMock.mock.calls[0][2] as Record<string, unknown>;
    expect(body).toMatchObject({
      query: "AI breakthroughs",
      type: "auto",
      numResults: 10,
      startPublishedDate: "2026-01-01",
    });
    expect(body).not.toHaveProperty("startCrawlDate");
    expect(body).not.toHaveProperty("endCrawlDate");
  });
});
