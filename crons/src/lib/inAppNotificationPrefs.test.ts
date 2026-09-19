import { describe, expect, it } from "vitest";
import { wantsInAppNotification } from "./inAppNotificationPrefs.js";

describe("wantsInAppNotification", () => {
    it("defaults to true when prefs are missing", () => {
        expect(wantsInAppNotification(undefined, "ratingChange")).toBe(true);
        expect(wantsInAppNotification({ all: {} }, "ratingChange")).toBe(true);
    });

    it("returns false when ratingChange is disabled", () => {
        expect(wantsInAppNotification({
            all: { inAppNotifications: { ratingChange: false } },
        }, "ratingChange")).toBe(false);
    });

    it("returns false when tournamentStart is disabled", () => {
        expect(wantsInAppNotification({
            all: { inAppNotifications: { tournamentStart: false } },
        }, "tournamentStart")).toBe(false);
    });
});
