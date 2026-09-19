export type InAppNotificationCategory =
    | "challenges"
    | "gameStart"
    | "gameEnd"
    | "ratingChange"
    | "eventInvitation"
    | "completedGameChat"
    | "tournamentStart"
    | "tournamentEnd";

export type InAppNotificationUserSettings = {
    all?: {
        inAppNotifications?: Partial<Record<InAppNotificationCategory, boolean>>;
        [k: string]: unknown;
    };
    [k: string]: unknown;
};

export function wantsInAppNotification(
    settings: InAppNotificationUserSettings | undefined,
    category: InAppNotificationCategory,
): boolean {
    const prefs = settings?.all?.inAppNotifications;
    if (prefs === undefined) {
        return true;
    }
    if (!Object.prototype.hasOwnProperty.call(prefs, category)) {
        return true;
    }
    return prefs[category] === true;
}
