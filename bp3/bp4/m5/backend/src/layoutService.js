import { Bp4ValidationError } from '../../../m1/backend/src/errors.js';

const ITEM_LIMIT = 30;

const normalizeItems = (items) => {
  if (!Array.isArray(items)) {
    throw new Bp4ValidationError('items must be an array');
  }

  if (items.length > ITEM_LIMIT) {
    throw new Bp4ValidationError(
      `A home can contain at most ${ITEM_LIMIT} items`,
    );
  }

  return items.map((item, index) => {
    if (typeof item?.materialId !== 'string' || !item.materialId.trim()) {
      throw new Bp4ValidationError(`items[${index}].materialId is required`);
    }

    const x = Number(item.x);
    const y = Number(item.y);
    const rotation = Number(item.rotation) || 0;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Bp4ValidationError(
        `items[${index}] must contain finite x and y`,
      );
    }

    return {
      id:
        typeof item.id === 'string' && item.id
          ? item.id
          : `item-${Date.now()}-${index}`,
      materialId: item.materialId.trim(),
      x: Math.max(0, Math.min(4, Math.round(x))),
      y: Math.max(0, Math.min(4, Math.round(y))),
      rotation: ((rotation % 360) + 360) % 360,
    };
  });
};

export const createLayoutService = ({
  repositories,
  ownershipResolver,
  realtimeHub,
}) => {
  const getLayout = (user, plotId) => {
    const layout = repositories.layouts.get(plotId);
    const ownerUserId = ownershipResolver.getOwnerUserId(plotId);

    if (!layout) {
      return {
        plotId,
        ownerUserId,
        items: [],
        version: 0,
        createdAt: null,
        updatedAt: null,
      };
    }

    return layout;
  };

  const saveLayout = ({ user, plotId, items }) => {
    const ownerUserId = ownershipResolver.requireOwner(user, plotId);
    const normalizedItems = normalizeItems(items);
    const layout = repositories.layouts.upsert({
      plotId,
      ownerUserId,
      items: normalizedItems,
    });
    const event = repositories.events.append({
      plotId,
      actorUserId: user.id,
      eventType: 'home.layout.updated',
      payload: {
        plotId,
        version: layout.version,
        items: layout.items,
      },
    });

    realtimeHub.publish({
      channelId: 'world-main',
      type: 'home.layout.updated',
      actorUserId: user.id,
      data: event.payload,
    });
    repositories.audit.record({
      actor: user,
      action: 'm5.home.layout.saved',
      resourceType: 'home',
      resourceId: plotId,
      result: 'success',
      details: {
        version: layout.version,
        itemCount: layout.items.length,
      },
    });

    return {
      layout,
      event,
    };
  };

  const listEvents = (plotId, afterSequence = 0) =>
    repositories.events.list(plotId, afterSequence);

  return Object.freeze({
    getLayout,
    listEvents,
    saveLayout,
  });
};
