import { describe, it, expect } from "@jest/globals";
import { normalizeEvent, unwrapPayload, normalizePayloadFields } from "../../../src/utils/normalize-event.js";
import type { BaseEvent } from "@langphy/shared";

describe("normalize-event utils", () => {
    const baseEvent: BaseEvent = {
        event_id: "evt-1",
        event_type: "session.completed.v1",
        event_version: 1,
        user_id: "user-1",
        occurred_at: new Date(),
        payload: { unit_id: "unit-1", session_type: "practice" },
    };

    describe("unwrapPayload", () => {
        it("returns payload as-is when no nesting", () => {
            const payload = { unit_id: "unit-1" };
            expect(unwrapPayload(payload)).toEqual(payload);
        });

        it("unwraps single nested payload", () => {
            const payload = { payload: { unit_id: "unit-1" } };
            expect(unwrapPayload(payload)).toEqual({ unit_id: "unit-1" });
        });

        it("unwraps multiple nested payloads", () => {
            const payload = { payload: { payload: { unit_id: "unit-1" } } };
            expect(unwrapPayload(payload)).toEqual({ unit_id: "unit-1" });
        });

        it("handles null/undefined gracefully", () => {
            expect(unwrapPayload(null)).toBeNull();
            expect(unwrapPayload(undefined)).toBeUndefined();
        });
    });

    describe("normalizePayloadFields", () => {
        it("converts camelCase to snake_case for known fields", () => {
            const payload = {
                unitId: "unit-1",
                userId: "user-1",
                lessonId: "lesson-1",
                categoryId: "cat-1",
                sessionType: "practice",
                duration_ms: 5000,
                occurredAt: 1234567890,
            };

            const normalized = normalizePayloadFields(payload);

            expect(normalized.unit_id).toBe("unit-1");
            expect(normalized.user_id).toBe("user-1");
            expect(normalized.lesson_id).toBe("lesson-1");
            expect(normalized.category_id).toBe("cat-1");
            expect(normalized.session_type).toBe("practice");
            expect(normalized.total_duration_ms).toBe(5000);
            expect(normalized.completed_at).toBe(1234567890);
            // camelCase originals should be deleted
            expect(normalized.unitId).toBeUndefined();
            expect(normalized.userId).toBeUndefined();
            expect(normalized.lessonId).toBeUndefined();
            expect(normalized.categoryId).toBeUndefined();
            expect(normalized.sessionType).toBeUndefined();
            expect(normalized.duration_ms).toBeUndefined();
            expect(normalized.occurredAt).toBeUndefined();
        });

        it("does not overwrite existing snake_case fields", () => {
            const payload = {
                unit_id: "explicit",
                unitId: "from-camel",
            };

            const normalized = normalizePayloadFields(payload);
            expect(normalized.unit_id).toBe("explicit");
        });

        it("preserves unknown fields", () => {
            const payload = { unit_id: "unit-1", unknownField: "value" };
            const normalized = normalizePayloadFields(payload);
            expect(normalized.unknownField).toBe("value");
        });
    });

    describe("normalizeEvent", () => {
        it("normalizes a complete event", () => {
            const eventWithCamelCase: BaseEvent = {
                ...baseEvent,
                payload: {
                    unitId: "unit-1",
                    sessionType: "practice",
                    duration_ms: 5000,
                },
            };

            const normalized = normalizeEvent(eventWithCamelCase);

            expect(normalized.payload.unit_id).toBe("unit-1");
            expect(normalized.payload.session_type).toBe("practice");
            expect(normalized.payload.total_duration_ms).toBe(5000);
            expect(normalized.event_id).toBe(baseEvent.event_id);
            expect(normalized.event_type).toBe(baseEvent.event_type);
            expect(normalized.user_id).toBe(baseEvent.user_id);
        });

        it("handles nested payload wrapper", () => {
            const eventWithWrapper: BaseEvent = {
                ...baseEvent,
                payload: {
                    payload: {
                        unitId: "unit-1",
                        sessionType: "practice",
                    },
                },
            };

            const normalized = normalizeEvent(eventWithWrapper);

            expect(normalized.payload.unit_id).toBe("unit-1");
            expect(normalized.payload.session_type).toBe("practice");
        });

        it("handles deeply nested payload wrappers", () => {
            const eventWithDeepWrapper: BaseEvent = {
                ...baseEvent,
                payload: {
                    payload: {
                        payload: {
                            unitId: "unit-1",
                        },
                    },
                },
            };

            const normalized = normalizeEvent(eventWithDeepWrapper);

            expect(normalized.payload.unit_id).toBe("unit-1");
        });
    });
});