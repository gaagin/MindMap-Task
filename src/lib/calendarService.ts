import { TaskNode } from '../types';

export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
}

/**
 * Fetches the user's Google Calendar list.
 */
export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list calendars: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Utility to format a date and optional time into Google Calendar's dateTime format.
 * Defaults to the local timezone.
 */
function getEventTimes(task: TaskNode) {
  const todayStr = new Date().toISOString().split('T')[0];
  const dateStr = task.startDate || task.dueDate || todayStr;
  const timeStr = task.startTime || task.dueTime;

  if (timeStr) {
    // Has a specific time (e.g. YYYY-MM-DDTHH:MM:SS)
    const startIso = `${dateStr}T${timeStr}:00`;
    // Create an end time +1 hour
    const [hours, minutes] = timeStr.split(':').map(Number);
    const endHours = (hours + 1) % 24;
    const endDayOffset = hours + 1 >= 24 ? 1 : 0;
    
    let endDateStr = dateStr;
    if (endDayOffset > 0) {
      const startD = new Date(`${dateStr}T12:00:00`);
      startD.setDate(startD.getDate() + 1);
      endDateStr = startD.toISOString().split('T')[0];
    }
    
    const paddedHours = String(endHours).padStart(2, '0');
    const paddedMinutes = String(minutes).padStart(2, '0');
    const endIso = `${endDateStr}T${paddedHours}:${paddedMinutes}:00`;

    // Guess system timezone
    let timeZone = 'UTC';
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {}

    return {
      start: { dateTime: startIso, timeZone },
      end: { dateTime: endIso, timeZone },
    };
  } else {
    // All-day event (must use 'date' fields, YYYY-MM-DD)
    // End date must be exclusive (+1 day from start date for a 1-day all-day event)
    const startD = new Date(`${dateStr}T12:00:00`);
    const endD = new Date(startD);
    endD.setDate(endD.getDate() + 1);
    
    const endIsoDate = endD.toISOString().split('T')[0];
    
    return {
      start: { date: dateStr },
      end: { date: endIsoDate },
    };
  }
}

/**
 * Helper to construct the Google Calendar Event Payload
 */
function buildEventPayload(task: TaskNode) {
  const { start, end } = getEventTimes(task);
  
  // Create a descriptive body
  let description = task.notes || '';
  if (task.priority && task.priority !== 'none') {
    description += `\n\nПриоритет: ${task.priority.toUpperCase()}`;
  }
  if (task.tags && task.tags.length > 0) {
    description += `\nТеги: ${task.tags.join(', ')}`;
  }
  description += `\nСтатус: ${task.completed ? '✅ Выполнено' : '⏳ В процессе'}`;
  description += `\n\nСинхронизировано из приложения Интеллект-Карты Задач`;

  return {
    summary: task.text || 'Без названия',
    description,
    start,
    end,
    status: task.completed ? 'confirmed' : 'tentative',
  };
}

/**
 * Syncs a task to Google Calendar.
 * If the task has a googleCalendarEventId, it will update the event.
 * If not, or if that event is missing, it will create a new one.
 */
export async function syncTaskToGoogleCalendar(
  accessToken: string,
  task: TaskNode,
  calendarId: string = 'primary'
): Promise<string> {
  const payload = buildEventPayload(task);
  const eventId = task.googleCalendarEventId;

  if (eventId) {
    // Attempt UPDATE (PUT)
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return eventId;
    }
    
    // If event is not found (e.g., deleted by user manually in GCal), fall back to creating a new one
    if (response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`Failed to update event: ${response.status} ${errorText}`);
    }
  }

  // Create NEW event (POST)
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create calendar event: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.id; // returns eventId
}

/**
 * Deletes an event from Google Calendar.
 */
export async function deleteEventFromGoogleCalendar(
  accessToken: string,
  eventId: string,
  calendarId: string = 'primary'
): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Failed to delete calendar event: ${response.status} ${errorText}`);
  }
}

/**
 * Fetches events from a specific Google Calendar for two-way synchronization.
 */
export async function listGoogleCalendarEvents(
  accessToken: string,
  calendarId: string = 'primary'
): Promise<any[]> {
  // Fetch up to 250 events, expanded single occurrences of recurring events, to sync correctly
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=250&singleEvents=true`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch calendar events: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.items || [];
}

