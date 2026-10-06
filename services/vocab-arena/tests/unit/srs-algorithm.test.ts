// Pure algorithm tests - no external dependencies
describe("SM-2 Algorithm", () => {
    function calculateNextInterval(
        easeFactor: number,
        intervalDays: number,
        repetitions: number,
        grade: number
    ): { intervalDays: number; repetitions: number; easeFactor: number } {
        let newEaseFactor = easeFactor;
        let newIntervalDays = intervalDays;
        let newRepetitions = repetitions;

        if (grade >= 3) {
            if (repetitions === 0) {
                newIntervalDays = 1;
            } else if (repetitions === 1) {
                newIntervalDays = 6;
            } else {
                newIntervalDays = Math.round(intervalDays * easeFactor);
            }
            newRepetitions += 1;
        } else {
            newRepetitions = 0;
            newIntervalDays = 0;
        }

        newEaseFactor = Math.max(1.3, easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

        return {
            intervalDays: newIntervalDays,
            repetitions: newRepetitions,
            easeFactor: newEaseFactor,
        };
    }

    it("should calculate interval = 1 for first successful review", () => {
        const result = calculateNextInterval(2.5, 0, 0, 5);
        expect(result.intervalDays).toBe(1);
        expect(result.repetitions).toBe(1);
        // Grade 5 slightly increases ease factor: 2.5 + 0.1 = 2.6
        expect(result.easeFactor).toBe(2.6);
    });

    it("should calculate interval = 6 for second successful review", () => {
        const result = calculateNextInterval(2.5, 1, 1, 5);
        expect(result.intervalDays).toBe(6);
        expect(result.repetitions).toBe(2);
    });

    it("should use ease factor for subsequent reviews", () => {
        const result = calculateNextInterval(2.5, 6, 2, 5);
        expect(result.intervalDays).toBe(15); // round(6 * 2.5)
        expect(result.repetitions).toBe(3);
    });

    it("should reset on failed recall (grade < 3)", () => {
        const result = calculateNextInterval(2.5, 10, 3, 2);
        expect(result.intervalDays).toBe(0);
        expect(result.repetitions).toBe(0);
    });

    it("should update ease factor based on grade", () => {
        const result5 = calculateNextInterval(2.5, 1, 1, 5);
        expect(result5.easeFactor).toBeGreaterThanOrEqual(2.5);

        const result3 = calculateNextInterval(2.5, 1, 1, 3);
        expect(result3.easeFactor).toBeLessThanOrEqual(2.5);
    });

    it("should not let ease factor go below 1.3", () => {
        const result = calculateNextInterval(1.3, 1, 1, 0);
        expect(result.easeFactor).toBe(1.3);
    });

    it("should handle grade 4 correctly", () => {
        const result = calculateNextInterval(2.5, 1, 1, 4);
        expect(result.intervalDays).toBe(6);
        expect(result.repetitions).toBe(2);
        expect(result.easeFactor).toBeCloseTo(2.5, 1);
    });
});

describe("XP Calculation", () => {
    function calculateXP(isCorrect: boolean, responseTimeMs: number): number {
        return isCorrect ? 10 + Math.max(0, 5 - responseTimeMs / 1000) : 0;
    }

    it("should give 15 XP for instant correct answer", () => {
        expect(calculateXP(true, 0)).toBe(15);
    });

    it("should give 10 XP for answer at 5 seconds", () => {
        expect(calculateXP(true, 5000)).toBe(10);
    });

    it("should give 0 XP for incorrect answer", () => {
        expect(calculateXP(false, 0)).toBe(0);
        expect(calculateXP(false, 1000)).toBe(0);
    });

    it("should cap minimum XP at 10 for correct answers", () => {
        expect(calculateXP(true, 10000)).toBe(10);
    });
});

describe("Level Calculation", () => {
    function calculateLevel(xp: number): number {
        return Math.floor(Math.sqrt(xp / 100)) + 1;
    }

    it("should calculate level from XP correctly", () => {
        expect(calculateLevel(0)).toBe(1);
        expect(calculateLevel(99)).toBe(1);
        expect(calculateLevel(100)).toBe(2);
        expect(calculateLevel(399)).toBe(2);
        expect(calculateLevel(400)).toBe(3);
        expect(calculateLevel(10000)).toBe(11);
    });
});

describe("Achievement Conditions", () => {
    function checkFirst50(totalWords: number): boolean {
        return totalWords >= 50;
    }

    function checkStreak7(currentStreak: number): boolean {
        return currentStreak >= 7;
    }

    function checkPerfectSession(wordsCorrect: number, wordsTotal: number): boolean {
        return wordsCorrect === wordsTotal && wordsTotal > 0;
    }

    function checkNightOwl(hour: number): boolean {
        return hour >= 22;
    }

    function checkEarlyBird(hour: number): boolean {
        return hour < 7;
    }

    it("should unlock first_50 at 50 words", () => {
        expect(checkFirst50(50)).toBe(true);
        expect(checkFirst50(49)).toBe(false);
        expect(checkFirst50(100)).toBe(true);
    });

    it("should unlock streak_7 at 7 days", () => {
        expect(checkStreak7(7)).toBe(true);
        expect(checkStreak7(6)).toBe(false);
        expect(checkStreak7(30)).toBe(true);
    });

    it("should unlock perfect_session when all correct", () => {
        expect(checkPerfectSession(10, 10)).toBe(true);
        expect(checkPerfectSession(9, 10)).toBe(false);
        expect(checkPerfectSession(0, 0)).toBe(false);
    });

    it("should unlock night_owl after 10 PM", () => {
        expect(checkNightOwl(22)).toBe(true);
        expect(checkNightOwl(23)).toBe(true);
        expect(checkNightOwl(14)).toBe(false);
    });

    it("should unlock early_bird before 7 AM", () => {
        expect(checkEarlyBird(6)).toBe(true);
        expect(checkEarlyBird(5)).toBe(true);
        expect(checkEarlyBird(7)).toBe(false);
    });
});

describe("Streak Calculation", () => {
    function calculateNewStreak(
        lastSessionDate: Date | null,
        today: Date
    ): { currentStreak: number; isNewDay: boolean } {
        if (!lastSessionDate) {
            return { currentStreak: 1, isNewDay: true };
        }

        const diffDays = Math.floor(
            (today.getTime() - lastSessionDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 0) {
            return { currentStreak: 0, isNewDay: false }; // Same day, no change
        } else if (diffDays === 1) {
            return { currentStreak: 1, isNewDay: true }; // Will be +1 in caller
        } else {
            return { currentStreak: 1, isNewDay: true }; // Reset
        }
    }

    it("should start streak at 1 for first session", () => {
        const today = new Date();
        const result = calculateNewStreak(null, today);
        expect(result.currentStreak).toBe(1);
        expect(result.isNewDay).toBe(true);
    });

    it("should not increment on same day", () => {
        const today = new Date();
        const result = calculateNewStreak(today, today);
        expect(result.currentStreak).toBe(0);
        expect(result.isNewDay).toBe(false);
    });

    it("should increment on consecutive day", () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const today = new Date();
        const result = calculateNewStreak(yesterday, today);
        expect(result.currentStreak).toBe(1);
        expect(result.isNewDay).toBe(true);
    });

    it("should reset after gap", () => {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const today = new Date();
        const result = calculateNewStreak(threeDaysAgo, today);
        expect(result.currentStreak).toBe(1);
        expect(result.isNewDay).toBe(true);
    });
});