const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const toUserInfo = (user) => ({
  id: `phase5-${user.id}`,
  userId: user.id,
  username: user.username,
  displayName: user.displayName || user.username,
});

/**
 * 好友关系内存存储：双向好友 + 待处理申请。
 * 不落盘（与 presence 一致，会话级）。
 */
export const createFriendStore = ({ now = Date.now } = {}) => {
  const friendships = new Map(); // pairKey -> { users: [a, b] }
  const requests = new Map(); // requestId -> { id, from, to, status, createdAt }

  const listFriends = (user) => {
    const friends = [];
    for (const record of friendships.values()) {
      const [a, b] = record.users;
      if (a.userId === user.id) friends.push(b);
      else if (b.userId === user.id) friends.push(a);
    }
    return friends;
  };

  const listRequests = (user) => {
    const list = [];
    for (const request of requests.values()) {
      if (request.status !== 'pending') continue;
      if (request.to.userId === user.id || request.from.userId === user.id) {
        list.push(request);
      }
    }
    return list;
  };

  const sendRequest = ({ from, to }) => {
    if (!to || from.id === to.id) return null;
    const key = pairKey(from.id, to.id);
    if (friendships.has(key)) return null;

    for (const request of requests.values()) {
      if (
        request.status === 'pending' &&
        pairKey(request.from.userId, request.to.userId) === key
      ) {
        return request;
      }
    }

    const request = {
      id: `req-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      from: toUserInfo(from),
      to: toUserInfo(to),
      status: 'pending',
      createdAt: new Date(now()).toISOString(),
    };
    requests.set(request.id, request);
    return request;
  };

  const respond = ({ requestId, user, accept }) => {
    const request = requests.get(requestId);
    if (
      !request ||
      request.status !== 'pending' ||
      request.to.userId !== user.id
    ) {
      return null;
    }

    if (accept) {
      friendships.set(pairKey(request.from.userId, request.to.userId), {
        users: [request.from, request.to],
      });
      request.status = 'accepted';
    } else {
      request.status = 'rejected';
    }
    return request;
  };

  const removeFriend = ({ user, friendId }) => {
    const key = pairKey(user.id, friendId);
    return friendships.delete(key);
  };

  return Object.freeze({
    listFriends,
    listRequests,
    sendRequest,
    respond,
    removeFriend,
  });
};
