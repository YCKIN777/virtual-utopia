import {
  Bp4ForbiddenError,
  Bp4ValidationError,
} from '../../../m1/backend/src/errors.js';
import { Bp4M3NotFoundError } from '../../../m3/backend/src/errors.js';

const requireText = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Bp4ValidationError(`${field} must be a non-empty string`);
  }

  return value.trim();
};

export const createTemplateService = ({ repositories }) => {
  const canWrite = (user) => ['admin', 'editor'].includes(user.role);

  const requireWrite = (user) => {
    if (!canWrite(user)) {
      throw new Bp4ForbiddenError(
        'Only administrators and editors can manage templates',
      );
    }
  };

  const list = ({ templateType = null, status = null } = {}) =>
    repositories.templates.list({
      templateType,
      status,
    });

  const get = (id) => {
    const template = repositories.templates.get(id);

    if (!template) {
      throw new Bp4M3NotFoundError('Content template not found');
    }

    return template;
  };

  const create = ({
    user,
    id,
    templateType,
    name,
    description,
    version,
    payload,
  }) => {
    requireWrite(user);

    if (!['home', 'scene'].includes(templateType)) {
      throw new Bp4ValidationError('templateType must be home or scene');
    }

    const template = repositories.templates.create({
      id: requireText(id, 'id'),
      templateType,
      name: requireText(name, 'name'),
      description: requireText(description, 'description'),
      version: version || '1.0.0',
      payload: payload && typeof payload === 'object' ? payload : {},
      createdBy: user.id,
    });

    repositories.audit.record({
      actor: user,
      action: 'm4.template.created',
      templateId: template.id,
      result: 'success',
      details: { templateType },
    });

    return template;
  };

  const update = ({ user, id, fields }) => {
    requireWrite(user);
    const template = repositories.templates.update(id, fields);

    if (!template) {
      throw new Bp4M3NotFoundError('Content template not found');
    }

    repositories.audit.record({
      actor: user,
      action: 'm4.template.updated',
      templateId: template.id,
      result: 'success',
      details: fields,
    });

    return template;
  };

  const publish = ({ user, id }) => {
    requireWrite(user);
    const template = repositories.templates.update(id, {
      status: 'published',
    });

    if (!template) {
      throw new Bp4M3NotFoundError('Content template not found');
    }

    repositories.audit.record({
      actor: user,
      action: 'm4.template.published',
      templateId: template.id,
      result: 'success',
    });

    return template;
  };

  const stats = () => ({
    total: repositories.templates.list().length,
    groups: repositories.templates.stats(),
  });

  return Object.freeze({
    create,
    get,
    list,
    publish,
    stats,
    update,
  });
};
