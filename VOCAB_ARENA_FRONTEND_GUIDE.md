# Vocab-Arena Service — Frontend Integration Guide

**Service**: `vocab-arena` (port 3010)  
**Public path**: `/api/vocab-arena/*` (via Caddy)  
**Auth**: All endpoints require `Authorization: Bearer <JWT>`

---

## What It Does

Gamified vocabulary learning with **spaced repetition (SM-2)**, **XP/levels**, **streaks**, and **achievements**. Separate from lesson progress — this is a dedicated "Arena" tab for word practice.

**Core loop**: Daily Set → Session (Flashcard/Type/Audio/Mixed) → SM-2 grading → XP + Streak + Achievements → Profile/Leaderboard

---

## Endpoints

### 1. Get Daily Word Set
```
GET /api/vocab-arena/daily-set
```
**Response**:
```json
{
  "words": [SrsWord],
  "dueCount": 8,
  "newCount": 3,
  "profile": { "xp": 1250, "level": 4, "currentStreak": 5, "longestStreak": 12 }
}
```
- `dueCount` = words due for review today (SRS)
- `newCount` = fresh words (never seen)
- Total ≤ 15 words. If empty, user has completed all available words.

### 2. Start Session
```
POST /api/vocab-arena/session/start
Body: { "mode": "flashcard" | "typing" | "audio" | "mixed", "words": SrsWord[] }
```
**Response**:
```json
{ "sessionId": "uuid", "words": SrsWord[] }
```
- Returns the exact words passed in (validated + persisted)
- `sessionId` required for subsequent answer/complete calls

### 3. Submit Answer (per word)
```
POST /api/vocab-arena/session/:id/answer
Body: { "lemma": "word", "grade": 0-5, "responseTimeMs": 1200 }
```
**Grades (SM-2)**:
- 0 = Complete blackout
- 1 = Incorrect, recalled after seeing answer
- 2 = Incorrect, but "knew it"
- 3 = Correct, difficult
- 4 = Correct, easy
- 5 = Perfect, instant

**Response**:
```json
{
  "isCorrect": true,
  "xpEarned": 14,
  "word": { ...updated SrsWord with new interval/repetitions... }
}
```
- XP formula: `correct ? 10 + max(0, 5 - responseTimeMs/1000) : 0` → max 15, min 10 per word
- If `repetitions >= 3 && interval_days > 30` → emits `vocabulary.word.mastered.v1` (push notification)

### 4. Complete Session
```
POST /api/vocab-arena/session/:id/complete
Body: { "mode", "wordsTotal", "wordsCorrect", "durationMs", "xpEarned", "newWordsLearned" }
```
**Response**:
```json
{
  "profile": { "xp": 1380, "level": 4, "currentStreak": 6, "longestStreak": 12, "totalWordsLearned": 47, "totalSessions": 23 },
  "newAchievements": [{ "code": "streak_7", "name": "Week Warrior", "xp_reward": 300 }]
}
```
- Awards XP, updates streak (checks if new calendar day), unlocks achievements
- Emits `vocabulary.session.completed.v1` (streaks + notification)
- Emits `vocabulary.achievement.unlocked.v1` per new achievement (notification)

### 5. Get Profile + Achievements
```
GET /api/vocab-arena/profile
```
**Response**:
```json
{
  "profile": { "xp": 1380, "level": 4, "currentStreak": 6, "longestStreak": 12, "totalWordsLearned": 47, "totalSessions": 23 },
  "achievements": [
    { "code": "first_50", "name": "Word Collector", "description": "Learn 50 unique words", "xp_reward": 200, "icon": "📚", "unlocked": true, "unlocked_at": "2026-01-15T10:30:00Z" },
    { "code": "streak_7", "name": "Week Warrior", ..., "unlocked": false, "unlocked_at": null }
  ]
}
```

### 6. Leaderboards
```
GET /api/vocab-arena/leaderboard?limit=50
GET /api/vocab-arena/leaderboard/weekly?limit=50
```
**Response**: `{ "leaderboard": [{ "user_id": "uuid", "xp": 5000, "level": 10, "current_streak": 30 }] }`

### 7. All Achievements (flat list)
```
GET /api/vocab-arena/achievements
```
Same format as `profile.achievements` but without profile wrapper.

---

## Data Structures

### SrsWord (used in daily-set, session/start, answer response)
```typescript
interface SrsWord {
  user_id: string;
  lemma: string;           // base form: "laufen"
  pos: string | null;      // "VERB", "NOUN", "ADJ"...
  meaning_en: string | null; // "to run"
  ease_factor: number;     // SM-2 ease factor (1.3–)
  interval_days: number;   // 0 = new, 1 = 1d, 6 = 6d, 21 = 21d...
  repetitions: number;     // successful recalls count
  next_review: string;     // ISO timestamp
  last_review: string | null;
  last_grade: number | null;
}
```

### Achievements (12 seeded)
| Code | Name | Trigger | XP |
|------|------|---------|-----|
| `first_session` | First Steps | Complete 1st session | 50 |
| `first_50` | Word Collector | 50 unique words | 200 |
| `first_100` | Vocabulary Builder | 100 unique words | 500 |
| `first_500` | Polyglot in Training | 500 unique words | 2000 |
| `streak_3` | Three-Peat | 3-day streak | 100 |
| `streak_7` | Week Warrior | 7-day streak | 300 |
| `streak_30` | Monthly Master | 30-day streak | 1000 |
| `perfect_session` | Perfectionist | 100% accuracy in session | 200 |
| `night_owl` | Night Owl | Session after 22:00 | 100 |
| `early_bird` | Early Bird | Session before 07:00 | 100 |
| `speed_demon` | Speed Demon | 10 words < 60s | 300 |
| `comeback_kid` | Comeback Kid | Resume after break | 200 |

---

## Client Implementation Notes

### Daily Set Screen
- Call `GET /daily-set` on tab mount
- Show `dueCount` (fire icon) + `newCount` (sparkle icon)
- "Start Session" → POST `/session/start` with selected mode + all words
- If `words.length === 0` → show "All caught up! Come back tomorrow"

### Session Screen
- Swipeable cards (one word at a time)
- **Flashcard**: Tap to flip → show meaning + "Again/Hard/Good/Easy" buttons (grades 1/3/4/5)
- **Typing**: Input field → auto-submit on enter → grade 5 if exact, 3 if typo, 0 if wrong
- **Audio**: Record button → send to `speech-service` → grade based on pronunciation score
- **Mixed**: Randomize mode per word
- Show progress ring: `currentIndex / words.length`
- Store answers locally for offline sync

### Session Complete Screen
- Show XP breakdown: `base XP + streak bonus (streak * 5) + perfect bonus (200 if 100%)`
- Level up animation if `newLevel > oldLevel`
- Toast each new achievement with icon + XP reward
- "Continue Tomorrow" button → deep link to daily set

### Profile/Stats Screen
- XP bar: `currentXP - levelStartXP` / `levelEndXP - levelStartXP`
- Level formula: `floor(sqrt(xp/100)) + 1`
- Calendar heatmap: use `vocab_session.started_at` (green intensity = sessions/day)
- Achievements grid: locked (grayscale) vs unlocked (color + date)

### Settings
- Daily goal: 5/10/15/20 → filters daily set size
- Notification time: passed to `notification` service via user preferences
- Audio autoplay: boolean for session screen

---

## Offline Support
- Cache `daily-set` response in `AsyncStorage` (expire at midnight)
- Queue answers locally → on reconnect, call `session/complete` with accumulated data
- No content versioning needed (SRS is per-user)

---

## Integration with Existing Services

| Service | Event Consumed | Effect |
|---------|----------------|--------|
| `streaks` | `vocabulary.session.completed.v1` | Increments user streak (same as lesson sessions) |
| `notification` | `vocabulary.session.completed.v1` | Daily reminder if no session today |
| `notification` | `vocabulary.achievement.unlocked.v1` | Push: "Achievement unlocked! +XP" |
| `notification` | `vocabulary.word.mastered.v1` | Push: "You mastered 'laufen'!" |

---

## Error Responses
All errors follow `{ errors: [{ message, field? }] }`:
- `401` — Invalid/expired JWT
- `400` — Validation failed (missing fields, invalid grade, etc.)
- `404` — Profile not found (should auto-create on first session)
- `500` — Server error

---

## Quick Start Checklist for Frontend

1. Add "Vocabulary" tab to bottom navigation
2. Implement `GET /daily-set` → render word count cards
3. Build session screen with 4 mode components (Flashcard/Type/Audio/Mixed)
4. Wire `POST /answer` per word → update local SM-2 state
5. On session end → `POST /complete` → show XP/achievement animations
6. Profile screen: XP bar, level, streak, achievements grid, leaderboard
7. Settings: daily goal, notification time, audio toggle
8. Offline queue for answers + sync on reconnect

That's it. The backend handles all SRS math, streak logic, and achievement unlocking — client just displays and collects input.