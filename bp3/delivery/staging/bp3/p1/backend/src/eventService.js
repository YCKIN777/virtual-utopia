import {
  Bp3ForbiddenError,
  Bp3ValidationError,
} from '../../../backend/src/errors.js';

const requireAdmin = (user) => {
  if (user.role !== 'admin') {
    throw new Bp3ForbiddenError('Only administrators can manage world events');
  }
};

const requireText = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Bp3ValidationError(`${field} must be a non-empty string`);
  }

  return value.trim();
};

const readOptionalDate = (value, field) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new Bp3ValidationError(`${field} must be an ISO date`);
  }

  return new Date(value).toISOString();
};

export const createEventService = ({ repositories }) => {
  const list = ({ statuses } = {}) => {
    repositories.transaction(() => {
      const now = new Date().toISOString();

      repositories.events
        .list({ statuses: ['scheduled'], limit: 500 })
        .filter(
          (event) =>
            event.startsAt &&
            Date.parse(event.startsAt) <= Date.parse(now) &&
            (!event.endsAt || Date.parse(event.endsAt) > Date.parse(now)),
        )
        .forEach((event) => {
          repositories.events.update(event.id, {
            status: 'active',
          });
        });

      repositories.events
        .list({ statuses: ['active'], limit: 500 })
        .filter(
          (event) =>
            event.endsAt && Date.parse(event.endsAt) <= Date.parse(now),
        )
        .forEach((event) => {
          repositories.events.update(event.id, {
            status: 'ended',
          });
        });
    });

    return repositories.events.list({
      statuses,
      limit: 100,
    });
  };

  const get = (eventId) => repositories.events.get(eventId);

  const create = ({
    user,
    title,
    description,
    status = 'draft',
    startsAt = null,
    endsAt = null,
  }) => {
    requireAdmin(user);

    if (!['draft', 'scheduled', 'active'].includes(status)) {
      throw new Bp3ValidationError(
        'Event status must be draft, scheduled or active',
      );
    }

    const event = repositories.events.create({
      title: requireText(title, 'title'),
      description: requireText(description, 'description'),
      status,
      startsAt: readOptionalDate(startsAt, 'startsAt'),
      endsAt: readOptionalDate(endsAt, 'endsAt'),
      createdBy: user.id,
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p1.event.created',
      resourceType: 'world-event',
      resourceId: event.id,
      result: 'success',
    });

    return event;
  };

  const update = ({
    eventId,
    user,
    title,
    description,
    status,
    startsAt,
    endsAt,
  }) => {
    requireAdmin(user);
    const event = repositories.events.update(eventId, {
      title: title === undefined ? undefined : requireText(title, 'title'),
      description:
        description === undefined
          ? undefined
          : requireText(description, 'description'),
      status,
      startsAt:
        startsAt === undefined
          ? undefined
          : readOptionalDate(startsAt, 'startsAt'),
      endsAt:
        endsAt === undefined ? undefined : readOptionalDate(endsAt, 'endsAt'),
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p1.event.updated',
      resourceType: 'world-event',
      resourceId: event.id,
      result: 'success',
    });

    return event;
  };

  const activate = ({ eventId, user }) => {
    requireAdmin(user);
    const current = repositories.events.get(eventId);
    const event = repositories.events.update(eventId, {
      status: 'active',
      startsAt: current?.startsAt || new Date().toISOString(),
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p1.event.activated',
      resourceType: 'world-event',
      resourceId: event.id,
      result: 'success',
    });

    return event;
  };

  const end = ({ eventId, user }) => {
    requireAdmin(user);
    const event = repositories.events.update(eventId, {
      status: 'ended',
      endsAt: new Date().toISOString(),
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p1.event.ended',
      resourceType: 'world-event',
      resourceId: event.id,
      result: 'success',
    });

    return event;
  };

  return Object.freeze({
    activate,
    create,
    end,
    get,
    list,
    update,
  });
};
