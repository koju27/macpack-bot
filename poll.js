import 'dotenv/config';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { DiscordRequest } from './utils.js';
 
// ---- Settings you can change ----
const POLL_TITLE = 'Next Week Takeover';
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const POLL_HOURS = 72;          // how long the poll stays open (max 768)
const ALLOW_MULTIPLE = true;    // let people pick more than one day
const SCHEDULE = '0 9 * * 5';   // every Friday at 9:00 AM (min hour day month weekday)
const TIMEZONE = 'America/Toronto';
const MESSAGE = 'Please vote for the next week (I don\'t want to ping cause thats annoying)'
 
// Builds labels like "Monday (Nov 16)" for the coming week
function nextWeekOptions() {
  const now = new Date();
  const daysUntilMonday = ((8 - now.getDay()) % 7) || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
 
  return WEEKDAYS.map((name, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const date = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${name} (${date})`;
  });
}
 
// Posts the poll to the channel set in POLL_CHANNEL_ID in your .env
export async function sendTakeoverPoll() {
  const channelId = process.env.POLL_CHANNEL_ID;
  if (!channelId) throw new Error('POLL_CHANNEL_ID is missing from .env');
 
  await DiscordRequest(`channels/${channelId}/messages`, {
    method: 'POST',
    body: {
      content: MESSAGE,
      allowed_mentions: { parse: ['users', 'roles', 'everyone'] },
      poll: {
        question: { text: POLL_TITLE },
        answers: nextWeekOptions().map((text) => ({ poll_media: { text } })),
        duration: POLL_HOURS,
        allow_multiselect: ALLOW_MULTIPLE,
      },
    },
  });
  console.log(`Posted "${POLL_TITLE}" poll`);
}
 
// Call this once from app.js to turn on the weekly schedule
export function scheduleTakeoverPoll() {
  cron.schedule(
    SCHEDULE,
    () => sendTakeoverPoll().catch((err) => console.error('Poll failed:', err)),
    { timezone: TIMEZONE }
  );
  console.log('Weekly takeover poll scheduled (Fridays 9:00 AM)');
}
 
// Running "node poll.js" directly sends one poll right now (for testing)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  sendTakeoverPoll().catch((err) => {
    console.error('Poll failed:', err);
    process.exit(1);
  });
}