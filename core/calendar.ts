import { getCalendarServiceToken } from "../utils/google_oauth.ts";

const CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3";

interface CalendarEvent {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: { email: string }[];
}

/**
 * Crea un evento en el calendario principal.
 */
export async function createCalendarEvent(eventData: CalendarEvent): Promise<string> {
  const token = await getCalendarServiceToken();

  const response = await fetch(`${CALENDAR_API_URL}/calendars/primary/events?sendUpdates=all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventData),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Error creando evento en Calendar: ${data.error?.message || "Desconocido"}`);
  }

  return data.id; // Retorna el ID del evento de Google Calendar
}

/**
 * Modifica las fechas de un evento existente.
 */
export async function updateCalendarEvent(eventId: string, newStart: string, newEnd: string): Promise<boolean> {
  const token = await getCalendarServiceToken();

  const response = await fetch(`${CALENDAR_API_URL}/calendars/primary/events/${eventId}?sendUpdates=all`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      start: { dateTime: newStart },
      end: { dateTime: newEnd }
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(`Error actualizando evento: ${data.error?.message || "Desconocido"}`);
  }

  return true;
}

/**
 * Consulta la disponibilidad del calendario en un rango de tiempo.
 * timeMin y timeMax deben ser formato RFC3339 (Ej: "2025-05-12T00:00:00Z")
 */
export async function listUpcomingEvents(timeMin: string, timeMax: string): Promise<any[]> {
  const token = await getCalendarServiceToken();

  const params = new URLSearchParams({
    timeMin: timeMin,
    timeMax: timeMax,
    singleEvents: "true",
    orderBy: "startTime"
  });

  const response = await fetch(`${CALENDAR_API_URL}/calendars/primary/events?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Error leyendo calendario: ${data.error?.message || "Desconocido"}`);
  }

  return data.items || [];
}
