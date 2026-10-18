export function normalizeRoomKey(roomId: string | null | undefined): string {
  const raw = (roomId ?? '').toString().trim();
  if (!raw) return '';

  const aliases: Record<string, string> = {
    science: 'Science Lab',
    'science lab': 'Science Lab',
    'science-lab': 'Science Lab',
    sciencelab: 'Science Lab',
    cafeteria: 'Cafeteria',
    auditorium: 'Auditorium',
    library: 'Library',
    lobby: 'Front Desk',
    'front desk': 'Front Desk',
    'front-desk': 'Front Desk',
    frontdesk: 'Front Desk',
    bathroom: 'Restroom',
    restroom: 'Restroom',
    restrooms: 'Restroom',
    janitor: "Janitor's Closet",
    janitorcloset: "Janitor's Closet",
    janitorscloset: "Janitor's Closet",
    janitorscloset1: "Janitor's Closet",
    closet: "Janitor's Closet",
    office: "Principal's Office",
    principalsoffice: "Principal's Office",
    'principal s office': "Principal's Office",
    gym: 'Gymnasium',
    gymnasium: 'Gymnasium',
    hallway: 'Hallway',
    hallways: 'Hallway',
    tunnel: 'Tunnel',
  };

  const compact = raw
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, ' ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

  if (!compact) return '';

  const normalized = compact.replace(/\s+/g, ' ');
  return aliases[normalized] ?? raw;
}

export function getRoomLabel(roomId: string | null | undefined): string {
  const key = normalizeRoomKey(roomId);
  if (!key) return 'Room';

  const ROOM_LABELS: Record<string, string> = {
    'Science Lab': 'Science Lab',
    Cafeteria: 'Cafeteria',
    Auditorium: 'Auditorium',
    Library: 'Library',
    'Front Desk': 'Front Desk',
    "Principal's Office": "Principal's Office",
    "Janitor's Closet": "Janitor's Closet",
    Restroom: 'Restroom',
    Tunnel: 'Tunnel',
    Gymnasium: 'Gymnasium',
    Hallway: 'Hallway',
  };

  return ROOM_LABELS[key] ?? key;
}
