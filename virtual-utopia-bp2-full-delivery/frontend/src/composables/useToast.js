import { readonly, ref } from 'vue';

const toasts = ref([]);
const timers = new Map();
let nextToastId = 0;

const removeToast = (id) => {
  const timer = timers.get(id);

  if (timer) {
    window.clearTimeout(timer);
    timers.delete(id);
  }

  toasts.value = toasts.value.filter((toast) => toast.id !== id);
};

const showToast = (message, options = {}) => {
  const id = ++nextToastId;
  const duration = options.duration ?? 3200;

  toasts.value.push({
    id,
    message,
    title: options.title || '',
    tone: options.tone || 'info',
  });

  if (duration > 0) {
    timers.set(
      id,
      window.setTimeout(() => removeToast(id), duration),
    );
  }

  return id;
};

export const useToast = () => ({
  toasts: readonly(toasts),
  show: showToast,
  info: (message, options) => showToast(message, { ...options, tone: 'info' }),
  success: (message, options) =>
    showToast(message, { ...options, tone: 'success' }),
  error: (message, options) =>
    showToast(message, { ...options, tone: 'error' }),
  remove: removeToast,
});
