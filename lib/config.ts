export const config = {
  displayName: process.env.USER_DISPLAY_NAME ?? 'Charlie',
  firstName: process.env.USER_DISPLAY_NAME?.split(' ')[0] ?? 'Charlie',
  location: process.env.USER_LOCATION ?? 'Columbus, OH',
  role: process.env.USER_ROLE ?? 'Student',
  timezone: process.env.USER_TIMEZONE ?? 'America/Chicago',
  userId: process.env.USER_ID ?? 'user',
  habits: [
    { id: 'workout', label: 'Workout', category: 'BODY' },
    { id: 'read', label: 'Read 10 pages', category: 'MIND' },
    { id: 'journal', label: 'Journal', category: 'REFLECT' },
    { id: 'eat_well', label: 'Eat Well', category: 'NUTRITION' },
    { id: 'cold_shower', label: 'Cold shower', category: 'BODY' },
    { id: 'sleep_10pm', label: 'Sleep by 10pm', category: 'SLEEP' },
  ],
  nutritionGoals: {
    kcal: 2800,
    protein: 180,
    carbs: 300,
    fat: 80,
    cutoffHour: 21, // 5:00 PM
  },
}
