import { Phase5NotFoundError } from './errors.js';

const timestamp = () => new Date().toISOString();

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const mapUser = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    hobbies: row.hobbies || null,
    occupation: row.occupation || null,
    selfIntro: row.self_intro || null,
    contact: row.contact || null,
    address: row.address || null,
    rejectReason: row.reject_reason || null,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const mapSession = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    sceneId: row.scene_id,
    sessionType: row.session_type,
    ownerAgentId: row.owner_agent_id,
    title: row.title,
    messages: parseJson(row.messages_json, []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
};

const mapDocument = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    documentKey: row.document_key,
    title: row.title,
    sourcePath: row.source_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    contentHash: row.content_hash,
    chunkCount: row.chunk_count,
    collectionName: row.collection_name,
    status: row.status,
    metadata: parseJson(row.metadata_json, {}),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const mapLog = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    operationType: row.operation_type,
    queryText: row.query_text,
    collectionName: row.collection_name,
    topK: row.top_k,
    similarityThreshold: row.similarity_threshold,
    matchedCount: row.matched_count,
    matchedChunks: parseJson(row.matched_chunks_json, []),
    latencyMs: row.latency_ms,
    status: row.status,
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
};

export const createRepositories = (database) => {
  const all = (sql, parameters = []) =>
    database.prepare(sql).all(...parameters);
  const get = (sql, parameters = []) =>
    database.prepare(sql).get(...parameters);
  const run = (sql, parameters = []) =>
    database.prepare(sql).run(...parameters);

  const users = {
    create({
      username,
      passwordHash,
      role,
      status = 'active',
      displayName = null,
      hobbies = null,
      occupation = null,
      selfIntro = null,
      contact = null,
      address = null,
    }) {
      const currentTime = timestamp();
      const result = run(
        `INSERT INTO users (
          username,
          password_hash,
          role,
          status,
          display_name,
          hobbies,
          occupation,
          self_intro,
          contact,
          address,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          username,
          passwordHash,
          role,
          status,
          displayName,
          hobbies,
          occupation,
          selfIntro,
          contact,
          address,
          currentTime,
          currentTime,
        ],
      );

      return users.getById(Number(result.lastInsertRowid));
    },
    getById(id) {
      return mapUser(get('SELECT * FROM users WHERE id = ?', [id]));
    },
    getByUsername(username) {
      return mapUser(get('SELECT * FROM users WHERE username = ?', [username]));
    },
    getByDisplayName(displayName) {
      return mapUser(
        get('SELECT * FROM users WHERE display_name = ?', [displayName]),
      );
    },
    list({ limit = 100, offset = 0, status } = {}) {
      if (status) {
        return all(
          `SELECT *
           FROM users
           WHERE status = ?
           ORDER BY created_at ASC
           LIMIT ? OFFSET ?`,
          [status, limit, offset],
        ).map(mapUser);
      }

      return all(
        `SELECT *
         FROM users
         ORDER BY created_at ASC
         LIMIT ? OFFSET ?`,
        [limit, offset],
      ).map(mapUser);
    },
    updatePassword(id, passwordHash) {
      const current = users.getById(id);

      if (!current) {
        throw new Phase5NotFoundError('user not found');
      }

      run(
        `UPDATE users
         SET password_hash = ?,
             updated_at = ?
         WHERE id = ?`,
        [passwordHash, timestamp(), id],
      );

      return users.getById(id);
    },
    update(id, fields) {
      const current = users.getById(id);

      if (!current) {
        throw new Phase5NotFoundError('user not found');
      }

      run(
        `UPDATE users
         SET role = ?,
             status = ?,
             display_name = ?,
             hobbies = ?,
             occupation = ?,
             self_intro = ?,
             contact = ?,
             address = ?,
             reject_reason = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.role ?? current.role,
          fields.status ?? current.status,
          fields.displayName ?? current.displayName,
          fields.hobbies ?? current.hobbies,
          fields.occupation ?? current.occupation,
          fields.selfIntro ?? current.selfIntro,
          fields.contact ?? current.contact,
          fields.address ?? current.address,
          fields.rejectReason ?? current.rejectReason,
          timestamp(),
          id,
        ],
      );

      return users.getById(id);
    },
    updateLastLogin(id) {
      const currentTime = timestamp();

      run(
        `UPDATE users
         SET last_login_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [currentTime, currentTime, id],
      );
    },
  };

  const sessions = {
    create({
      id,
      userId = null,
      sceneId,
      sessionType,
      ownerAgentId,
      title = null,
      messages = [],
      status = 'active',
      expiresAt,
    }) {
      const currentTime = timestamp();

      run(
        `INSERT INTO chat_sessions (
          id,
          user_id,
          scene_id,
          session_type,
          owner_agent_id,
          title,
          messages_json,
          status,
          created_at,
          updated_at,
          expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          sceneId,
          sessionType,
          ownerAgentId,
          title,
          JSON.stringify(messages),
          status,
          currentTime,
          currentTime,
          expiresAt,
        ],
      );

      return sessions.getById(id);
    },
    getById(id) {
      return mapSession(get('SELECT * FROM chat_sessions WHERE id = ?', [id]));
    },
    list({ userId, allUsers = false, limit = 100, offset = 0 } = {}) {
      if (allUsers) {
        return all(
          `SELECT *
           FROM chat_sessions
           WHERE status != 'deleted'
           ORDER BY updated_at DESC
           LIMIT ? OFFSET ?`,
          [limit, offset],
        ).map(mapSession);
      }

      return all(
        `SELECT *
         FROM chat_sessions
         WHERE user_id = ?
           AND status != 'deleted'
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset],
      ).map(mapSession);
    },
    update(id, fields) {
      const current = sessions.getById(id);

      if (!current) {
        throw new Phase5NotFoundError('session not found');
      }

      run(
        `UPDATE chat_sessions
         SET title = ?,
             messages_json = ?,
             status = ?,
             expires_at = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.title ?? current.title,
          JSON.stringify(fields.messages ?? current.messages),
          fields.status ?? current.status,
          fields.expiresAt ?? current.expiresAt,
          timestamp(),
          id,
        ],
      );

      return sessions.getById(id);
    },
    delete(id) {
      return sessions.update(id, {
        status: 'deleted',
      });
    },
  };

  const documents = {
    create({
      documentKey,
      title,
      sourcePath,
      fileName,
      mimeType = null,
      contentHash,
      chunkCount = 0,
      collectionName,
      status = 'pending',
      metadata = {},
      createdBy = null,
    }) {
      const currentTime = timestamp();
      const result = run(
        `INSERT INTO knowledge_documents (
          document_key,
          title,
          source_path,
          file_name,
          mime_type,
          content_hash,
          chunk_count,
          collection_name,
          status,
          metadata_json,
          created_by,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documentKey,
          title,
          sourcePath,
          fileName,
          mimeType,
          contentHash,
          chunkCount,
          collectionName,
          status,
          JSON.stringify(metadata),
          createdBy,
          currentTime,
          currentTime,
        ],
      );

      return documents.getById(Number(result.lastInsertRowid));
    },
    getById(id) {
      return mapDocument(
        get('SELECT * FROM knowledge_documents WHERE id = ?', [id]),
      );
    },
    getByKey(documentKey) {
      return mapDocument(
        get('SELECT * FROM knowledge_documents WHERE document_key = ?', [
          documentKey,
        ]),
      );
    },
    list({ status, collectionName, limit = 100, offset = 0 } = {}) {
      const conditions = [];
      const parameters = [];

      if (status) {
        conditions.push('status = ?');
        parameters.push(status);
      }

      if (collectionName) {
        conditions.push('collection_name = ?');
        parameters.push(collectionName);
      }

      const where =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      parameters.push(limit, offset);

      return all(
        `SELECT *
         FROM knowledge_documents
         ${where}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`,
        parameters,
      ).map(mapDocument);
    },
    update(id, fields) {
      const current = documents.getById(id);

      if (!current) {
        throw new Phase5NotFoundError('document not found');
      }

      run(
        `UPDATE knowledge_documents
         SET title = ?,
             source_path = ?,
             file_name = ?,
             mime_type = ?,
             content_hash = ?,
             chunk_count = ?,
             collection_name = ?,
             status = ?,
             metadata_json = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          fields.title ?? current.title,
          fields.sourcePath ?? current.sourcePath,
          fields.fileName ?? current.fileName,
          fields.mimeType ?? current.mimeType,
          fields.contentHash ?? current.contentHash,
          fields.chunkCount ?? current.chunkCount,
          fields.collectionName ?? current.collectionName,
          fields.status ?? current.status,
          JSON.stringify(fields.metadata ?? current.metadata),
          timestamp(),
          id,
        ],
      );

      return documents.getById(id);
    },
    delete(id) {
      return documents.update(id, {
        status: 'deleted',
      });
    },
  };

  const logs = {
    create({
      userId = null,
      sessionId = null,
      operationType,
      queryText = null,
      collectionName = null,
      topK = null,
      similarityThreshold = null,
      matchedCount = 0,
      matchedChunks = [],
      latencyMs = null,
      status,
      errorCode = null,
    }) {
      const result = run(
        `INSERT INTO rag_logs (
          user_id,
          session_id,
          operation_type,
          query_text,
          collection_name,
          top_k,
          similarity_threshold,
          matched_count,
          matched_chunks_json,
          latency_ms,
          status,
          error_code,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          sessionId,
          operationType,
          queryText,
          collectionName,
          topK,
          similarityThreshold,
          matchedCount,
          JSON.stringify(matchedChunks),
          latencyMs,
          status,
          errorCode,
          timestamp(),
        ],
      );

      return logs.getById(Number(result.lastInsertRowid));
    },
    getById(id) {
      return mapLog(get('SELECT * FROM rag_logs WHERE id = ?', [id]));
    },
    list({
      userId,
      sessionId,
      status,
      from,
      to,
      limit = 100,
      offset = 0,
    } = {}) {
      const conditions = [];
      const parameters = [];

      if (userId !== undefined && userId !== null) {
        conditions.push('user_id = ?');
        parameters.push(userId);
      }

      if (sessionId) {
        conditions.push('session_id = ?');
        parameters.push(sessionId);
      }

      if (status) {
        conditions.push('status = ?');
        parameters.push(status);
      }

      if (from) {
        conditions.push('created_at >= ?');
        parameters.push(from);
      }

      if (to) {
        conditions.push('created_at <= ?');
        parameters.push(to);
      }

      const where =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      parameters.push(limit, offset);

      return all(
        `SELECT *
         FROM rag_logs
         ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        parameters,
      ).map(mapLog);
    },
  };

  return Object.freeze({
    users,
    sessions,
    documents,
    logs,
  });
};
