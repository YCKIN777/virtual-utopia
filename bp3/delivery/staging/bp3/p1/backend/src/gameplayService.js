import {
  Bp3ConflictError,
  Bp3ForbiddenError,
  Bp3NotFoundError,
  Bp3ValidationError,
} from '../../../backend/src/errors.js';

const requireAdmin = (user) => {
  if (user.role !== 'admin') {
    throw new Bp3ForbiddenError(
      'Only administrators can configure P1 gameplay',
    );
  }
};

const requireText = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Bp3ValidationError(`${field} must be a non-empty string`);
  }

  return value.trim();
};

const requirePositiveInteger = (value, field) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Bp3ValidationError(`${field} must be a positive integer`);
  }

  return parsed;
};

const requireFiniteNumber = (value, field) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Bp3ValidationError(`${field} must be a finite number`);
  }

  return parsed;
};

const readRewardItems = (items) => {
  if (items === undefined) {
    return [];
  }

  if (!Array.isArray(items)) {
    throw new Bp3ValidationError('rewardItems must be an array');
  }

  return items.map((item) => ({
    itemId: requireText(item.itemId, 'rewardItems.itemId'),
    quantity: requirePositiveInteger(item.quantity, 'rewardItems.quantity'),
  }));
};

const assertCatalogItems = ({ repositories, items }) => {
  items.forEach((item) => {
    if (!repositories.catalog.get(item.itemId)) {
      throw new Bp3ValidationError(
        `Reward item does not exist: ${item.itemId}`,
      );
    }
  });
};

const isNodeAvailable = (node, at = Date.now()) =>
  !node.nextAvailableAt || Date.parse(node.nextAvailableAt) <= at;

export const createGameplayService = ({ config, repositories }) => {
  const getInventory = (userId) =>
    repositories.inventories.ensure(userId, config.defaultInventoryCapacity);

  const listTasks = ({ user }) => {
    const tasks = repositories.tasks.list({
      status: 'active',
      limit: 200,
    });
    const instances = new Map(
      repositories.tasks
        .listInstancesByUser(user.id)
        .map((instance) => [instance.taskId, instance]),
    );

    return tasks.map((task) => ({
      ...task,
      instance: instances.get(task.id) || null,
    }));
  };

  const listCatalog = () => repositories.catalog.list();

  const createTask = ({
    user,
    eventId = null,
    title,
    description,
    targetItemId,
    targetQuantity,
    rewardItems = [],
    rewardShards = 0,
    repeatable = false,
  }) => {
    requireAdmin(user);

    if (!repositories.catalog.get(targetItemId)) {
      throw new Bp3ValidationError(
        'targetItemId does not exist in item catalog',
      );
    }

    const normalizedRewardItems = readRewardItems(rewardItems);

    assertCatalogItems({
      repositories,
      items: normalizedRewardItems,
    });

    const task = repositories.tasks.create({
      eventId,
      title: requireText(title, 'title'),
      description: requireText(description, 'description'),
      targetItemId,
      targetQuantity: requirePositiveInteger(targetQuantity, 'targetQuantity'),
      rewardItems: normalizedRewardItems,
      rewardShards: Math.max(Number.parseInt(rewardShards, 10) || 0, 0),
      repeatable: Boolean(repeatable),
      createdBy: user.id,
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p1.task.created',
      resourceType: 'task',
      resourceId: task.id,
      result: 'success',
    });

    return task;
  };

  const updateTask = ({ taskId, user, fields = {} }) => {
    requireAdmin(user);
    const normalized = {
      ...fields,
      rewardItems:
        fields.rewardItems === undefined
          ? undefined
          : readRewardItems(fields.rewardItems),
    };

    if (normalized.rewardItems) {
      assertCatalogItems({
        repositories,
        items: normalized.rewardItems,
      });
    }

    return repositories.tasks.update(taskId, normalized);
  };

  const acceptTask = ({ taskId, user }) => {
    const task = repositories.tasks.get(taskId);

    if (!task || task.status !== 'active') {
      throw new Bp3NotFoundError('Active task not found');
    }

    const instance = repositories.tasks.createInstance({
      taskId,
      userId: user.id,
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p1.task.accepted',
      resourceType: 'task-instance',
      resourceId: instance.id,
      result: 'success',
    });

    return instance;
  };

  const updateTaskProgress = ({
    taskId,
    targetUserId = null,
    user,
    progress,
  }) => {
    requireAdmin(user);
    const task = repositories.tasks.get(taskId);

    if (!task) {
      throw new Bp3NotFoundError('Task not found');
    }

    const resolvedUserId = targetUserId
      ? requirePositiveInteger(targetUserId, 'targetUserId')
      : user.id;
    const instance = repositories.tasks.getInstance(taskId, resolvedUserId);

    if (!instance) {
      throw new Bp3NotFoundError('Accept the task before updating progress');
    }

    const nextProgress = Math.min(Number(progress), task.targetQuantity);
    const updated = repositories.tasks.updateProgress(
      instance.id,
      nextProgress,
    );

    if (nextProgress >= task.targetQuantity && updated.status === 'accepted') {
      return repositories.tasks.complete(updated.id);
    }

    return updated;
  };

  const completeTaskForCollection = ({ userId, itemId, quantity }) => {
    const matching = repositories.tasks.listAcceptedForItem(userId, itemId);

    return matching.map(({ instance, task }) => {
      const nextProgress = Math.min(
        instance.progress + quantity,
        task.targetQuantity,
      );
      const updated = repositories.tasks.updateProgress(
        instance.id,
        nextProgress,
      );

      if (nextProgress >= task.targetQuantity) {
        return repositories.tasks.complete(updated.id);
      }

      return updated;
    });
  };

  const claimTask = ({ taskId, user }) => {
    const instance = repositories.tasks.getInstance(taskId, user.id);

    if (!instance) {
      throw new Bp3NotFoundError('Task instance not found');
    }

    if (instance.status === 'claimed') {
      return {
        instance,
        inventory: getInventory(user.id),
        granted: false,
        alreadyClaimed: true,
      };
    }

    if (instance.status !== 'completed') {
      throw new Bp3ConflictError(
        'Task must be completed before claiming rewards',
      );
    }

    const task = repositories.tasks.get(taskId);
    const reward = {
      items: task.rewardItems,
      shards: task.rewardShards,
    };

    const result = repositories.transaction(() => {
      const current = repositories.tasks.getInstance(taskId, user.id);

      if (current.status === 'claimed') {
        return {
          instance: current,
          granted: false,
        };
      }

      repositories.rewardGrants.create({
        taskInstanceId: current.id,
        userId: user.id,
        reward,
      });
      task.rewardItems.forEach((item) => {
        repositories.inventories.addItem({
          userId: user.id,
          itemId: item.itemId,
          quantity: item.quantity,
          reason: 'task_reward',
          referenceId: current.id,
          capacity: config.defaultInventoryCapacity,
        });
      });
      const claimed = repositories.tasks.claim(current.id);

      return {
        instance: claimed,
        granted: true,
      };
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p1.task.reward_claimed',
      resourceType: 'task-instance',
      resourceId: instance.id,
      result: 'success',
      details: reward,
    });

    return {
      ...result,
      inventory: getInventory(user.id),
      alreadyClaimed: false,
      reward,
    };
  };

  const createResourceNode = ({
    user,
    name,
    itemId,
    quantity,
    x,
    y,
    z,
    interactionRadius = 5,
    respawnSeconds = 90,
  }) => {
    requireAdmin(user);

    if (!repositories.catalog.get(itemId)) {
      throw new Bp3ValidationError('itemId does not exist in item catalog');
    }

    const node = repositories.resourceNodes.create({
      name: requireText(name, 'name'),
      itemId,
      quantity: requirePositiveInteger(quantity, 'quantity'),
      x: requireFiniteNumber(x, 'x'),
      y: requireFiniteNumber(y, 'y'),
      z: requireFiniteNumber(z, 'z'),
      interactionRadius: requireFiniteNumber(
        interactionRadius,
        'interactionRadius',
      ),
      respawnSeconds: requirePositiveInteger(respawnSeconds, 'respawnSeconds'),
      createdBy: user.id,
    });

    repositories.auditLogs.record({
      actorUserId: user.id,
      action: 'p1.resource_node.created',
      resourceType: 'resource-node',
      resourceId: node.id,
      result: 'success',
    });

    return {
      ...node,
      available: true,
    };
  };

  const updateResourceNode = ({ nodeId, user, fields = {} }) => {
    requireAdmin(user);
    const node = repositories.resourceNodes.update(nodeId, fields);

    return {
      ...node,
      available: isNodeAvailable(node),
    };
  };

  const listResourceNodes = () =>
    repositories.resourceNodes.list().map((node) => ({
      ...node,
      available: isNodeAvailable(node),
    }));

  const collectResource = ({ nodeId, user, position }) => {
    const x = requireFiniteNumber(position?.x, 'position.x');
    const y = requireFiniteNumber(position?.y, 'position.y');
    const z = requireFiniteNumber(position?.z, 'position.z');

    return repositories.transaction(() => {
      const node = repositories.resourceNodes.get(nodeId);

      if (!node || node.status !== 'active') {
        throw new Bp3NotFoundError('Active resource node not found');
      }

      if (!isNodeAvailable(node)) {
        throw new Bp3ConflictError('Resource node is respawning');
      }

      const distance = Math.hypot(x - node.x, y - node.y, z - node.z);

      if (distance > node.interactionRadius) {
        throw new Bp3ForbiddenError('Move closer to collect this resource');
      }

      const nextAvailableAt = new Date(
        Date.now() + node.respawnSeconds * 1000,
      ).toISOString();
      const collectedNode = repositories.resourceNodes.markCollected({
        id: node.id,
        userId: user.id,
        nextAvailableAt,
      });
      const inventoryItem = repositories.inventories.addItem({
        userId: user.id,
        itemId: node.itemId,
        quantity: node.quantity,
        reason: 'resource_collection',
        referenceId: `${node.id}:${Date.now()}`,
        capacity: config.defaultInventoryCapacity,
      });
      const collection = repositories.resourceCollections.create({
        nodeId: node.id,
        userId: user.id,
        itemId: node.itemId,
        quantity: node.quantity,
      });
      const progress = completeTaskForCollection({
        userId: user.id,
        itemId: node.itemId,
        quantity: node.quantity,
      });

      return {
        node: {
          ...collectedNode,
          available: false,
        },
        collection,
        inventoryItem,
        progress,
      };
    });
  };

  const grantItem = ({
    user,
    targetUserId,
    itemId,
    quantity,
    reason = 'admin_grant',
    idempotencyKey = null,
  }) => {
    requireAdmin(user);
    const resolvedUserId = requirePositiveInteger(targetUserId, 'targetUserId');

    if (!repositories.catalog.get(itemId)) {
      throw new Bp3ValidationError('itemId does not exist in item catalog');
    }

    if (idempotencyKey) {
      const existing = repositories.inventories.findTransaction({
        userId: resolvedUserId,
        itemId,
        reason,
        referenceId: idempotencyKey,
      });

      if (existing) {
        return {
          item: repositories.inventories.getItem(resolvedUserId, itemId),
          inventory: getInventory(resolvedUserId),
          idempotent: true,
        };
      }
    }

    const item = repositories.transaction(() =>
      repositories.inventories.addItem({
        userId: resolvedUserId,
        itemId,
        quantity: requirePositiveInteger(quantity, 'quantity'),
        reason,
        referenceId: idempotencyKey,
        capacity: config.defaultInventoryCapacity,
      }),
    );

    return {
      item,
      inventory: getInventory(resolvedUserId),
      idempotent: false,
    };
  };

  const consumeItem = ({
    user,
    itemId,
    quantity,
    reason = 'manual_consume',
  }) => {
    const item = repositories.transaction(() =>
      repositories.inventories.consumeItem({
        userId: user.id,
        itemId,
        quantity: requirePositiveInteger(quantity, 'quantity'),
        reason,
      }),
    );

    return {
      item,
      inventory: getInventory(user.id),
    };
  };

  const listInventoryTransactions = ({ user, limit = 100 }) =>
    repositories.inventories.listTransactions(
      user.id,
      Math.min(Math.max(Number(limit) || 100, 1), 500),
    );

  return Object.freeze({
    acceptTask,
    claimTask,
    collectResource,
    consumeItem,
    createResourceNode,
    createTask,
    getInventory,
    grantItem,
    listCatalog,
    listInventoryTransactions,
    listResourceNodes,
    listTasks,
    updateResourceNode,
    updateTask,
    updateTaskProgress,
  });
};
