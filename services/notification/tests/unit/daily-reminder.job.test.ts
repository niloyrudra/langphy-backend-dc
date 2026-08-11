// Unit tests for the daily reminder job functionality
import { isInEveningHours, updateReminderCount } from "../../src/jobs/daily-reminder.job";

// Mock the database connection
jest.mock("../../src/db/index.js", () => ({
  pgPool: {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    })
  }
}));

// Mock date for consistent testing
jest.useFakeTimers();

describe('Daily Reminder Job', () => {
  beforeEach(() => {
    // Reset to a known time for testing: 2026-08-11T12:00:00Z (noon UTC)
    jest.setSystemTime(new Date('2026-08-11T12:00:00Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('isInEveningHours', () => {
    test('should return true for evening hours in UTC', () => {
      // 19:00 UTC = 7:00 PM UTC (evening)
      jest.setSystemTime(new Date('2026-08-11T19:00:00Z'));
      expect(isInEveningHours(new Date(), 'UTC')).toBe(true);
    });

    test('should return false for morning hours in UTC', () => {
      // 10:00 UTC = 10:00 AM UTC (morning)
      jest.setSystemTime(new Date('2026-08-11T10:00:00Z'));
      expect(isInEveningHours(new Date(), 'UTC')).toBe(false);
    });

    test('should handle timezone conversion correctly', () => {
      // Test with New York timezone (UTC-4 during summer)
      // When it's 19:00 UTC, it's 15:00 (3:00 PM) in New York - not evening yet
      jest.setSystemTime(new Date('2026-08-11T19:00:00Z'));
      expect(isInEveningHours(new Date(), 'America/New_York')).toBe(false);
      
      // When it's 23:00 UTC, it's 19:00 (7:00 PM) in New York - evening
      jest.setSystemTime(new Date('2026-08-11T23:00:00Z'));
      expect(isInEveningHours(new Date(), 'America/New_York')).toBe(true);
    });

    test('should handle invalid timezones gracefully', () => {
      // Should fallback to UTC check
      jest.setSystemTime(new Date('2026-08-11T19:00:00Z')); // 19:00 UTC = evening
      expect(isInEveningHours(new Date(), 'Invalid/Timezone')).toBe(true);
      
      jest.setSystemTime(new Date('2026-08-11T10:00:00Z')); // 10:00 UTC = morning
      expect(isInEveningHours(new Date(), 'Invalid/Timezone')).toBe(false);
    });
  });

  describe('updateReminderCount', () => {
    test('should insert new reminder count when none exists', async () => {
      // Mock the database connection and queries
      const mockQuery = jest.fn();
      (jest.mocked(require("../../src/db/index.js").pgPool.connect) as jest.Mock).mockResolvedValueOnce({
        query: mockQuery,
        release: jest.fn()
      });

      // Mock query to resolve differently based on call count
      mockQuery
        .mockResolvedValueOnce({}) // BEGIN transaction
        .mockResolvedValueOnce({}) // INSERT query
        .mockResolvedValueOnce({}) // COMMIT transaction
        .mockRejectedValueOnce(new Error("Unexpected query call")); // Fail if called more times than expected

      await updateReminderCount(require("../../src/db/index.js").pgPool, "test-user-id");

      // Verify the connection was acquired
      expect(require("../../src/db/index.js").pgPool.connect).toHaveBeenCalled();
      
      // Verify BEGIN transaction
      expect(mockQuery).toHaveBeenNthCalledWith(1, "BEGIN");
      
      // Verify INSERT query - normalize whitespace for comparison
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain("INSERT INTO lp_user_reminder_counts");
      expect(insertCall[0]).toContain("VALUES ($1, CURRENT_DATE, 1, NOW())");
      expect(insertCall[0]).toContain("ON CONFLICT (user_id, reminder_date)");
      expect(insertCall[0]).toContain("DO UPDATE SET");
      expect(insertCall[0]).toContain("count = lp_user_reminder_counts.count + 1");
      expect(insertCall[0]).toContain("last_reminder_at = NOW()");
      expect(insertCall[1]).toEqual(["test-user-id"]);
    });

    test('should handle database errors gracefully', async () => {
      // Mock a database error on BEGIN transaction
      const mockError = new Error("Database error");
      const mockQuery = jest.fn().mockRejectedValueOnce(mockError);
      (jest.mocked(require("../../src/db/index.js").pgPool.connect) as jest.Mock).mockResolvedValueOnce({
        query: mockQuery,
        release: jest.fn()
      });

      await expect(updateReminderCount(require("../../src/db/index.js").pgPool, "test-user-id"))
        .rejects.toThrow("Database error");

      // Verify that the query was attempted
      expect(mockQuery).toHaveBeenCalledWith("BEGIN");
      // Note: In a real test, we'd also verify rollback was called, 
      // but that's harder to mock without exposing the catch block internals
      // For now, we're testing that the error propagates correctly
    });
  });
});