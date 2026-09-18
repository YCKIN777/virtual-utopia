import {
  Bp3ConflictError,
  Bp3NotFoundError,
} from '../../../backend/src/errors.js';
import { createOpaqueToken } from '../../../backend/src/security.js';

const timestamp = () => new Date().toISOString();

const parseJson = (value, fallback = []) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapEvent = (row) =>
  row
    ? {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapTask = (row) =>
  row
    ? {
        id: row.id,
        eventId: row.event_id,
        title: row.title,
        description: row.description,
        taskType: row.task_type,
        targetItemId: row.target_item_id,
        targetQuantity: row.target_quantity,
        rewardItems: parseJson(row.reward_items_json, []),
        rewardShards: row.reward_shards,
        status: row.status,
        repeatable: row.repeatable === 1,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapTaskInstance = (row) =>
  row
    ? {
        id: row.id,
        taskId: row.task_id,
        userId: row.user_id,
        status: row.status,
        progress: row.progress,
        acceptedAt: row.accepted_at,
        completedAt: row.completed_at,
        claimedAt: row.claimed_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapResourceNode = (row) =>
  row
    ? {
        id: row.id,
        name: row.name,
        itemId: row.item_id,
        quantity: row.quantity,
        x: row.x,
        y: row.y,
        z: row.z,
        interactionRadius: row.interaction_radius,
        respawnSeconds: row.respawn_seconds,
        status: row.status,
        nextAvailableAt: row.next_available_at,
        lastCollectedBy: row.last_collected_by,
        lastCollectedAt: row.last_collected_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapInventory = (row, items = []) =>
  row
    ? {
        userId: row.user_id,
        capacity: row.capacity,
        usedSlots: items.length,
        items,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

const mapItem = (row) =>
  row
    ? {
        itemId: row.item_id,
        name: row.name,
        category: row.category,
        rarity: row.rarity,
        maxStack: row.max_stack,
        iconColor: row.icon_color,
      }
    : null;

const mapInventoryItem = (row, catalog) => ({
  itemId: row.item_id,
  quantity: row.quantity,
  updatedAt: row.updated_at,
  ...catalog,
});

export const createP1Repositories = ({ database, transaction }) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const catalog = {
    get(itemId) {
      return mapItem(
        get(
          `SELECT *
           FROM bp3_p1_item_catalog
           WHERE item_id = ?`,
          [itemId],
        ),
      );
    },
    list() {
      return all(
        `SELECT *
         FROM bp3_p1_item_catalog
         ORDER BY category ASC, item_id ASC`,
      ).map(mapItem);
    },
  };

  const events = {
    create({
      title,
      description,
      status = 'draft',
      startsAt = null,
      endsAt = null,
      createdBy,
    }) {
      const id = `event-${Date.now()}-${createOpaqueToken(5)}`;
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_p1_world_events (
          id,
          title,
          description,
          status,
          starts_at,
          ends_at,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title,
          description,
          status,
          startsAt,
          endsAt,
          createdBy,
          currentTime,
          currentTime,
        ],
      );

      return events.get(id);
    },
    get(id) {
      return mapEvent(
        get('SELECT * FROM bp3_p1_world_events WHERE id = ?', [id]),
      );
    },
    list({ statuses = null, limit = 100 } = {}) {
      if (statuses?.length) {
        const placeholders = statuses.map(() => '?').join(', ');

        return all(
          `SELECT *
           FROM bp3_p1_world_events
           WHERE status IN (${placeholders})
           ORDER BY COALESCE(starts_at, created_at) ASC
           LIMIT ?`,
          [...statuses, limit],
        ).map(mapEvent);
      }

      return all(
        `SELECT *
         FROM bp3_p1_world_events
         ORDER BY created_at DESC
         LIMIT ?`,
        [limit],
      ).map(mapEvent);
    },
    update(id, fields) {
      const current = events.get(id);

      if (!current) {
        throw new Bp3NotFoundError('World event not found');
      }

      run(
        `UPDATE bp3_p1_world_events
         SET title = ?,
             description = ?,
             status = ?,
             starts_at = ?,
             ends_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.title ?? current.title,
          fields.description ?? current.description,
          fields.status ?? current.status,
          fields.startsAt === undefined ? current.startsAt : fields.startsAt,
          fields.endsAt === undefined ? current.endsAt : fields.endsAt,
          timestamp(),
          id,
        ],
      );

      return events.get(id);
    },
  };

  const tasks = {
    create({
      eventId = null,
      title,
      description,
      targetItemId,
      targetQuantity,
      rewardItems = [],
      rewardShards = 0,
      status = 'active',
      repeatable = false,
      createdBy,
    }) {
      const id = `task-${Date.now()}-${createOpaqueToken(5)}`;
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_p1_tasks (
          id,
          event_id,
          title,
          description,
          task_type,
          target_item_id,
          target_quantity,
          reward_items_json,
          reward_shards,
          status,
          repeatable,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'collect_item', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          eventId,
          title,
          description,
          targetItemId,
          targetQuantity,
          JSON.stringify(rewardItems),
          rewardShards,
          status,
          Number(repeatable),
          createdBy,
          currentTime,
          currentTime,
        ],
      );

      return tasks.get(id);
    },
    get(id) {
      return mapTask(get('SELECT * FROM bp3_p1_tasks WHERE id = ?', [id]));
    },
    list({ status = null, eventId = null, limit = 100 } = {}) {
      const clauses = [];
      const parameters = [];

      if (status) {
        clauses.push('status = ?');
        parameters.push(status);
      }

      if (eventId) {
        clauses.push('event_id = ?');
        parameters.push(eventId);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

      parameters.push(limit);

      return all(
        `SELECT *
         FROM bp3_p1_tasks
         ${where}
         ORDER BY created_at DESC
         LIMIT ?`,
        parameters,
      ).map(mapTask);
    },
    update(id, fields) {
      const current = tasks.get(id);

      if (!current) {
        throw new Bp3NotFoundError('Task not found');
      }

      run(
        `UPDATE bp3_p1_tasks
         SET event_id = ?,
             title = ?,
             description = ?,
             target_item_id = ?,
             target_quantity = ?,
             reward_items_json = ?,
             reward_shards = ?,
             status = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.eventId === undefined ? current.eventId : fields.eventId,
          fields.title ?? current.title,
          fields.description ?? current.description,
          fields.targetItemId ?? current.targetItemId,
          fields.targetQuantity ?? current.targetQuantity,
          JSON.stringify(fields.rewardItems ?? current.rewardItems),
          fields.rewardShards ?? current.rewardShards,
          fields.status ?? current.status,
          timestamp(),
          id,
        ],
      );

      return tasks.get(id);
    },
    createInstance({ taskId, userId }) {
      const existing = tasks.getInstance(taskId, userId);

      if (existing) {
        return existing;
      }

      const id = `task-instance-${Date.now()}-${createOpaqueToken(5)}`;
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_p1_task_instances (
          id,
          task_id,
          user_id,
          status,
          progress,
          accepted_at,
          updated_at
        ) VALUES (?, ?, ?, 'accepted', 0, ?, ?)`,
        [id, taskId, userId, currentTime, currentTime],
      );

      return tasks.getInstance(taskId, userId);
    },
    getInstance(taskId, userId) {
      return mapTaskInstance(
        get(
          `SELECT *
           FROM bp3_p1_task_instances
           WHERE task_id = ? AND user_id = ?`,
          [taskId, userId],
        ),
      );
    },
    getInstanceById(id) {
      return mapTaskInstance(
        get(
          `SELECT *
           FROM bp3_p1_task_instances
           WHERE id = ?`,
          [id],
        ),
      );
    },
    listInstancesByUser(userId) {
      return all(
        `SELECT *
         FROM bp3_p1_task_instances
         WHERE user_id = ?
         ORDER BY updated_at DESC`,
        [userId],
      ).map(mapTaskInstance);
    },
    updateProgress(id, progress) {
      const instance = tasks.getInstanceById(id);

      if (!instance) {
        throw new Bp3NotFoundError('Task instance not found');
      }

      const nextProgress = Math.max(instance.progress, Number(progress));
      const currentTime = timestamp();

      run(
        `UPDATE bp3_p1_task_instances
         SET progress = ?,
             status = CASE
               WHEN status = 'accepted' THEN 'accepted'
               ELSE status
             END,
             updated_at = ?
         WHERE id = ?`,
        [nextProgress, currentTime, id],
      );

      return tasks.getInstanceById(id);
    },
    complete(id) {
      const currentTime = timestamp();

      run(
        `UPDATE bp3_p1_task_instances
         SET status = 'completed',
             completed_at = COALESCE(completed_at, ?),
             updated_at = ?
         WHERE id = ? AND status = 'accepted'`,
        [currentTime, currentTime, id],
      );

      return tasks.getInstanceById(id);
    },
    claim(id) {
      const currentTime = timestamp();

      run(
        `UPDATE bp3_p1_task_instances
         SET status = 'claimed',
             claimed_at = COALESCE(claimed_at, ?),
             updated_at = ?
         WHERE id = ? AND status = 'completed'`,
        [currentTime, currentTime, id],
      );

      return tasks.getInstanceById(id);
    },
    listAcceptedForItem(userId, itemId) {
      return all(
        `SELECT
           instance.*,
           task.target_item_id,
           task.target_quantity,
           task.title,
           task.reward_items_json,
           task.reward_shards
         FROM bp3_p1_task_instances AS instance
         JOIN bp3_p1_tasks AS task
           ON task.id = instance.task_id
         WHERE instance.user_id = ?
           AND instance.status = 'accepted'
           AND task.status = 'active'
           AND task.target_item_id = ?`,
        [userId, itemId],
      ).map((row) => ({
        instance: mapTaskInstance(row),
        task: {
          id: row.task_id,
          title: row.title,
          targetItemId: row.target_item_id,
          targetQuantity: row.target_quantity,
          rewardItems: parseJson(row.reward_items_json, []),
          rewardShards: row.reward_shards,
        },
      }));
    },
  };

  const resourceNodes = {
    create({
      name,
      itemId,
      quantity,
      x,
      y,
      z,
      interactionRadius = 5,
      respawnSeconds = 90,
      status = 'active',
      createdBy,
    }) {
      const id = `resource-${Date.now()}-${createOpaqueToken(5)}`;
      const currentTime = timestamp();

      run(
        `INSERT INTO bp3_p1_resource_nodes (
          id,
          name,
          item_id,
          quantity,
          x,
          y,
          z,
          interaction_radius,
          respawn_seconds,
          status,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          itemId,
          quantity,
          x,
          y,
          z,
          interactionRadius,
          respawnSeconds,
          status,
          createdBy,
          currentTime,
          currentTime,
        ],
      );

      return resourceNodes.get(id);
    },
    get(id) {
      return mapResourceNode(
        get('SELECT * FROM bp3_p1_resource_nodes WHERE id = ?', [id]),
      );
    },
    list({ status = 'active', includeUnavailable = true } = {}) {
      const clauses = [];
      const parameters = [];

      if (status) {
        clauses.push('status = ?');
        parameters.push(status);
      }

      if (!includeUnavailable) {
        clauses.push('(next_available_at IS NULL OR next_available_at <= ?)');
        parameters.push(timestamp());
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

      return all(
        `SELECT *
         FROM bp3_p1_resource_nodes
         ${where}
         ORDER BY name ASC`,
        parameters,
      ).map(mapResourceNode);
    },
    update(id, fields) {
      const current = resourceNodes.get(id);

      if (!current) {
        throw new Bp3NotFoundError('Resource node not found');
      }

      run(
        `UPDATE bp3_p1_resource_nodes
         SET name = ?,
             item_id = ?,
             quantity = ?,
             x = ?,
             y = ?,
             z = ?,
             interaction_radius = ?,
             respawn_seconds = ?,
             status = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.name ?? current.name,
          fields.itemId ?? current.itemId,
          fields.quantity ?? current.quantity,
          fields.x ?? current.x,
          fields.y ?? current.y,
          fields.z ?? current.z,
          fields.interactionRadius ?? current.interactionRadius,
          fields.respawnSeconds ?? current.respawnSeconds,
          fields.status ?? current.status,
          timestamp(),
          id,
        ],
      );

      return resourceNodes.get(id);
    },
    markCollected({ id, userId, nextAvailableAt }) {
      const currentTime = timestamp();

      run(
        `UPDATE bp3_p1_resource_nodes
         SET last_collected_by = ?,
             last_collected_at = ?,
             next_available_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [userId, currentTime, nextAvailableAt, currentTime, id],
      );

      return resourceNodes.get(id);
    },
  };

  const resourceCollections = {
    create({ nodeId, userId, itemId, quantity }) {
      const result = run(
        `INSERT INTO bp3_p1_resource_collections (
          node_id,
          user_id,
          item_id,
          quantity,
          created_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [nodeId, userId, itemId, quantity, timestamp()],
      );

      return {
        id: Number(result.lastInsertRowid),
        nodeId,
        userId,
        itemId,
        quantity,
      };
    },
  };

  const inventories = {
    ensure(userId, capacity) {
      const currentTime = timestamp();

      run(
        `INSERT OR IGNORE INTO bp3_p1_inventories (
          user_id,
          capacity,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?)`,
        [userId, capacity, currentTime, currentTime],
      );

      return inventories.get(userId);
    },
    get(userId) {
      const row = get(
        `SELECT *
         FROM bp3_p1_inventories
         WHERE user_id = ?`,
        [userId],
      );

      if (!row) {
        return null;
      }

      const items = all(
        `SELECT *
         FROM bp3_p1_inventory_items
         WHERE user_id = ?
         ORDER BY item_id ASC`,
        [userId],
      ).map((itemRow) =>
        mapInventoryItem(itemRow, catalog.get(itemRow.item_id)),
      );

      return mapInventory(row, items);
    },
    getItem(userId, itemId) {
      const row = get(
        `SELECT *
         FROM bp3_p1_inventory_items
         WHERE user_id = ? AND item_id = ?`,
        [userId, itemId],
      );

      return row ? mapInventoryItem(row, catalog.get(itemId)) : null;
    },
    addItem({
      userId,
      itemId,
      quantity,
      reason,
      referenceId = null,
      capacity,
    }) {
      const inventory = inventories.ensure(userId, capacity);
      const current = inventories.getItem(userId, itemId);
      const catalogItem = catalog.get(itemId);
      const usedSlots = all(
        `SELECT item_id
         FROM bp3_p1_inventory_items
         WHERE user_id = ?`,
        [userId],
      ).length;

      if (!catalogItem) {
        throw new Bp3NotFoundError('Inventory item not found');
      }

      if (!current && usedSlots >= inventory.capacity) {
        throw new Bp3ConflictError('Inventory capacity is full');
      }

      const nextQuantity = (current?.quantity || 0) + Number(quantity);

      if (nextQuantity > catalogItem.maxStack) {
        throw new Bp3ConflictError(
          `Item stack limit is ${catalogItem.maxStack}`,
        );
      }

      run(
        `INSERT INTO bp3_p1_inventory_items (
          user_id,
          item_id,
          quantity,
          updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, item_id) DO UPDATE SET
          quantity = excluded.quantity,
          updated_at = excluded.updated_at`,
        [userId, itemId, nextQuantity, timestamp()],
      );
      run(
        `UPDATE bp3_p1_inventories
         SET capacity = ?,
             updated_at = ?
         WHERE user_id = ?`,
        [inventory.capacity, timestamp(), userId],
      );
      inventories.recordTransaction({
        userId,
        itemId,
        delta: Number(quantity),
        balanceAfter: nextQuantity,
        reason,
        referenceId,
      });

      return inventories.getItem(userId, itemId);
    },
    consumeItem({ userId, itemId, quantity, reason, referenceId = null }) {
      const current = inventories.getItem(userId, itemId);
      const amount = Number(quantity);

      if (!current || current.quantity < amount) {
        throw new Bp3ConflictError('Insufficient inventory item');
      }

      const result = run(
        `UPDATE bp3_p1_inventory_items
         SET quantity = quantity - ?,
             updated_at = ?
         WHERE user_id = ?
           AND item_id = ?
           AND quantity >= ?`,
        [amount, timestamp(), userId, itemId, amount],
      );

      if (result.changes !== 1) {
        throw new Bp3ConflictError('Inventory changed during consumption');
      }

      const next = inventories.getItem(userId, itemId);

      inventories.recordTransaction({
        userId,
        itemId,
        delta: -amount,
        balanceAfter: next?.quantity || 0,
        reason,
        referenceId,
      });

      return next;
    },
    recordTransaction({
      userId,
      itemId,
      delta,
      balanceAfter,
      reason,
      referenceId = null,
    }) {
      run(
        `INSERT INTO bp3_p1_inventory_transactions (
          user_id,
          item_id,
          delta,
          balance_after,
          reason,
          reference_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, itemId, delta, balanceAfter, reason, referenceId, timestamp()],
      );
    },
    listTransactions(userId, limit = 100) {
      return all(
        `SELECT *
         FROM bp3_p1_inventory_transactions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [userId, limit],
      ).map((row) => ({
        id: row.id,
        userId: row.user_id,
        itemId: row.item_id,
        delta: row.delta,
        balanceAfter: row.balance_after,
        reason: row.reason,
        referenceId: row.reference_id,
        createdAt: row.created_at,
      }));
    },
    findTransaction({ userId, itemId, reason, referenceId }) {
      const row = get(
        `SELECT *
         FROM bp3_p1_inventory_transactions
         WHERE user_id = ?
           AND item_id = ?
           AND reason = ?
           AND reference_id = ?`,
        [userId, itemId, reason, referenceId],
      );

      return row
        ? {
            id: row.id,
            userId: row.user_id,
            itemId: row.item_id,
            delta: row.delta,
            balanceAfter: row.balance_after,
            reason: row.reason,
            referenceId: row.reference_id,
            createdAt: row.created_at,
          }
        : null;
    },
  };

  const rewardGrants = {
    create({ taskInstanceId, userId, reward }) {
      const id = `reward-${Date.now()}-${createOpaqueToken(5)}`;

      run(
        `INSERT INTO bp3_p1_reward_grants (
          id,
          task_instance_id,
          user_id,
          reward_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [id, taskInstanceId, userId, JSON.stringify(reward), timestamp()],
      );

      return rewardGrants.getByTaskInstance(taskInstanceId);
    },
    getByTaskInstance(taskInstanceId) {
      const row = get(
        `SELECT *
         FROM bp3_p1_reward_grants
         WHERE task_instance_id = ?`,
        [taskInstanceId],
      );

      return row
        ? {
            id: row.id,
            taskInstanceId: row.task_instance_id,
            userId: row.user_id,
            reward: parseJson(row.reward_json, {}),
            createdAt: row.created_at,
          }
        : null;
    },
  };

  const auditLogs = {
    record({
      actorUserId = null,
      action,
      resourceType,
      resourceId = null,
      result,
      details = {},
    }) {
      run(
        `INSERT INTO bp3_p1_audit_logs (
          actor_user_id,
          action,
          resource_type,
          resource_id,
          result,
          details_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          actorUserId,
          action,
          resourceType,
          resourceId,
          result,
          JSON.stringify(details),
          timestamp(),
        ],
      );
    },
  };

  return Object.freeze({
    auditLogs,
    catalog,
    events,
    inventories,
    resourceCollections,
    resourceNodes,
    rewardGrants,
    tasks,
    transaction,
  });
};
