import { deriveSourceFromType } from './notification-source.util.js';

export function serializeNotificationRow(row: any) {
  const source = row.source ?? deriveSourceFromType(row.type);
  let actor = null;
  if ((source === 'USER' || source === 'ADMIN') && row.actorSnapshot) {
    actor = row.actorSnapshot;
  } else if ((source === 'USER' || source === 'ADMIN') && row.actorId && row.data) {
    // try to extract from data if present
    const data = row.data as any;
    actor = {
      id: row.actorId,
      displayName: data.actorName ?? data.actorUsername ?? data.senderNameSnapshot ?? null,
      username: data.actorUsername ?? null,
      avatarUrl: data.actorProfilePicture ?? data.senderAvatarSnapshot ?? null,
    };
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    data: row.data,
    readAt: row.readAt,
    createdAt: row.createdAt,
    source,
    actor,
  };
}
