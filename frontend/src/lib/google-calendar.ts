import "server-only";

import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";

// Server-side Google Calendar client. Tokens live in the encrypted Auth.js
// JWT cookie and never reach the browser; this module reads them directly.

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (first day)
  endDate?: string; // YYYY-MM-DD (last covered day, inclusive) when multi-day
  time?: string; // HH:MM, present for timed (non-all-day) events
  source: "google";
};

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// Server components cannot persist a rotated token back into the cookie, so
// remember refreshed access tokens per refresh token for this instance.
const refreshCache = new Map<string, { accessToken: string; expiresAt: number }>();

async function readSessionCookie(): Promise<{ value: string; salt: string } | null> {
  const jar = await cookies();
  for (const name of ["__Secure-authjs.session-token", "authjs.session-token"]) {
    const value = jar.get(name)?.value;
    if (value) return { value, salt: name };
  }
  return null;
}

export async function getGoogleAccessToken(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  const raw = await readSessionCookie();
  if (!secret || !raw) return null;

  let token: Record<string, unknown> | null;
  try {
    token = (await decode({ token: raw.value, secret, salt: raw.salt })) as Record<
      string,
      unknown
    > | null;
  } catch {
    return null;
  }
  if (!token) return null;

  const accessToken = typeof token.access_token === "string" ? token.access_token : null;
  const expiresAt = typeof token.expires_at === "number" ? token.expires_at : 0;
  const refreshToken = typeof token.refresh_token === "string" ? token.refresh_token : null;

  if (accessToken && Date.now() < expiresAt * 1000 - 60_000) return accessToken;
  if (!refreshToken) return null;

  const cached = refreshCache.get(refreshToken);
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.accessToken;

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID ?? "",
        client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const refreshed = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !refreshed.access_token) return null;

    refreshCache.set(refreshToken, {
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    });
    return refreshed.access_token;
  } catch {
    return null;
  }
}

function toDateString(start: { date?: string; dateTime?: string } | undefined): string | null {
  if (start?.date) return start.date;
  if (start?.dateTime) return start.dateTime.slice(0, 10);
  return null;
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

// Last day an event actually covers. All-day `end.date` is exclusive; timed
// events ending exactly at midnight belong to the previous day.
function toLastDay(
  startDate: string,
  end: { date?: string; dateTime?: string } | undefined
): string {
  let last = startDate;
  if (end?.date) {
    last = shiftDate(end.date, -1);
  } else if (end?.dateTime) {
    last = end.dateTime.slice(0, 10);
    if (end.dateTime.slice(11, 16) === "00:00") last = shiftDate(last, -1);
  }
  return last < startDate ? startDate : last;
}

// Lists events from the primary calendar in a window around today (wide
// enough to cover the dashboard's month navigation and agenda).
export async function listGoogleEvents(accessToken: string): Promise<GoogleCalendarEvent[]> {
  const now = Date.now();
  const timeMin = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString();

  const url = `${CALENDAR_BASE}?${new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  })}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Calendar list failed: ${res.status}`);

  const body = (await res.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      start?: { date?: string; dateTime?: string };
      end?: { date?: string; dateTime?: string };
    }>;
  };

  const events: GoogleCalendarEvent[] = [];
  for (const item of body.items ?? []) {
    const date = toDateString(item.start);
    if (!item.id || !date) continue;
    const lastDay = toLastDay(date, item.end);
    events.push({
      id: item.id,
      title: item.summary?.trim() || "(untitled)",
      date,
      endDate: lastDay > date ? lastDay : undefined,
      time: item.start?.dateTime ? item.start.dateTime.slice(11, 16) : undefined,
      source: "google",
    });
  }
  return events;
}

// Creates an all-day event on the primary calendar. The API's end date is
// exclusive, so a one-day event ends the following day.
export async function createGoogleEvent(
  accessToken: string,
  input: { title: string; date: string }
): Promise<void> {
  const start = new Date(`${input.date}T00:00:00Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const endDate = end.toISOString().slice(0, 10);

  const res = await fetch(CALENDAR_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.title,
      start: { date: input.date },
      end: { date: endDate },
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar create failed: ${res.status}`);
}

export async function deleteGoogleEvent(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${CALENDAR_BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar delete failed: ${res.status}`);
  }
}
