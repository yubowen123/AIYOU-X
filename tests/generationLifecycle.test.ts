import { describe, expect, it } from "vitest";
import { generationStatusFromResponse } from "../src/main/generationTaskStore";

describe("generation task lifecycle", () => {
  it("normalizes common asynchronous provider states", () => {
    expect(generationStatusFromResponse({ success: true, status: 200, data: { taskId: "1", status: "queued" } })).toBe("queued");
    expect(generationStatusFromResponse({ success: true, status: 200, data: { data: { task_id: "1", state: "PROCESSING" } } })).toBe("running");
    expect(generationStatusFromResponse({ success: true, status: 200, data: { taskId: "1", taskStatus: "succeeded" } })).toBe("completed");
    expect(generationStatusFromResponse({ success: true, status: 200, data: { taskId: "1", status: "failed" } })).toBe("failed");
    expect(generationStatusFromResponse({ success: true, status: 200, data: { taskId: "1", status: "canceled" } })).toBe("canceled");
  });

  it("treats synchronous media results as completed and transport failures as failed", () => {
    expect(generationStatusFromResponse({ success: true, status: 200, data: { output: { videoUrl: "https://example.com/a.mp4" } } })).toBe("completed");
    expect(generationStatusFromResponse({ success: false, status: 500, error: "failed" })).toBe("failed");
  });
});
