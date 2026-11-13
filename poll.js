import 'dotenv/config';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { DiscordRequest } from './utils.js';

// ---- Day poll (Fridays) ----
const DAY_POLL_TITLE = 'Next Week Takeover';
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_POLL_HOURS = 24;      // closes Saturday morning, before the time poll goes out

// ---- Time poll (Saturdays, for the winning day) ----
const TIME_SLOTS = ['10-12', '12-2', '2-4', '4-6', '8-10 (pm)'];
const TIME_POLL_HOURS = 48;

// ---- Shared settings ----
const MESSAGE = "Please vote for the next week (I don't want to ping cause thats annoying)";
const ALLOW_MULTIPLE = true;    // let people pick more than one option
const TIMEZONE = 'America/Toronto';

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

// Posts a poll with the given question and answer labels
async function postPoll(question, options, hours) {
  const channelId = process.env.POLL_CHANNEL_ID;
  if (!channelId) throw new Error('POLL_CHANNEL_ID is missing');

  await DiscordRequest(`channels/${channelId}/messages`, {
    method: 'POST',
    body: {
      content: MESSAGE,
      allowed_mentions: { parse: ['users', 'roles', 'everyone'] },
      poll: {
        question: { text: question },
        answers: options.map((text) => ({ poll_media: { text } })),
        duration: hours,
        allow_multiselect: ALLOW_MULTIPLE,
      },
    },
  });
  console.log(`Posted poll: "${question}"`);
}

// Friday: "Next Week Takeover" with Monday-Friday
export async function sendDayPoll() {
  await postPoll(DAY_POLL_TITLE, nextWeekOptions(), DAY_POLL_HOURS);
}

// Saturday: finds the latest day poll, picks the day with the most votes,
// and posts "What time <day>" with the time slots
export async function sendTimePoll() {
  const channelId = process.env.POLL_CHANNEL_ID;
  const res = await DiscordRequest(`channels/${channelId}/messages?limit=50`, { method: 'GET' });
  const messages = await res.json();

  let dayPoll = messages.find((m) => m.poll?.question?.text === DAY_POLL_TITLE);
  if (!dayPoll) {
    console.log('No recent day poll found in the last 50 messages, skipping time poll');
    return;
  }

  
  // If it's still open (e.g. when testing), close it now and wait for the final tally.
  if (!dayPoll.poll.results?.is_finalized) {
    console.log('Day poll still open, closing it to get final results...');
    await DiscordRequest(`channels/${channelId}/polls/${dayPoll.id}/expire`, { method: 'POST' });
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const again = await DiscordRequest(`channels/${channelId}/messages/${dayPoll.id}`, { method: 'GET' });
      dayPoll = await again.json();
      if (dayPoll.poll.results?.is_finalized) break;
    }
  }

  const counts = dayPoll.poll.results?.answer_counts ?? [];
  console.log('Day poll results:', JSON.stringify(counts));
  let winner = null;
  let best = 0;
  for (const answer of dayPoll.poll.answers) {
    const votes = counts.find((c) => c.id === answer.answer_id)?.count ?? 0;
    if (votes > best) {        // on a tie, the earlier day wins
      best = votes;
      winner = answer.poll_media.text;
    }
  }

  if (!winner) {
    console.log('Nobody voted on the day poll, skipping time poll');
    return;
  }

  await postPoll(`What time ${winner}`, TIME_SLOTS, TIME_POLL_HOURS);
}

// Optional: run both on your own PC instead of GitHub Actions (call from app.js)
export function scheduleTakeoverPoll() {
  const opts = { timezone: TIMEZONE };
  cron.schedule('0 9 * * 5', () => sendDayPoll().catch(console.error), opts);
  cron.schedule('0 10 * * 6', () => sendTimePoll().catch(console.error), opts);
  console.log('Polls scheduled: day poll Fri 9 AM, time poll Sat 10 AM');
}

// "node poll.js" sends the day poll, "node poll.js time" sends the time poll
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = process.argv[2] === 'time' ? sendTimePoll : sendDayPoll;
  run().catch((err) => {
    console.error('Poll failed:', err);
    process.exit(1);
  });
}