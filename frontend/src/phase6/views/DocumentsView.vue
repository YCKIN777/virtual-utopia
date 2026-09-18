<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import ModalDialog from '../components/ModalDialog.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { documentStatusOptions } from '../config.js';
import { authStore } from '../stores/authStore.js';

const pageSize = 20;
const api = authStore.api;
const canWrite = computed(() => authStore.hasRole('admin', 'editor'));
const filters = reactive({
  status: '',
  collectionName: '',
  keyword: '',
});
const documents = ref([]);
const loading = ref(false);
const errorMessage = ref('');
const page = ref(0);
const selectedDocument = ref(null);
const detailOpen = ref(false);
const uploadOpen = ref(false);
const deleteOpen = ref(false);
const deleteTarget = ref(null);
const uploadFile = ref(null);
const uploadTitle = ref('');
const uploadCollection = ref('virtual_utopia_rag');
const uploadError = ref('');
const uploadBusy = ref(false);
const deleteBusy = ref(false);

const hasPrevious = computed(() => page.value > 0);
const hasNext = computed(() => documents.value.length === pageSize);

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const loadDocuments = async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const payload = await api.listDocuments({
      ...filters,
      limit: pageSize,
      offset: page.value * pageSize,
    });

    documents.value = payload.documents || [];
  } catch (error) {
    errorMessage.value = error.message || '文档列表加载失败';
  } finally {
    loading.value = false;
  }
};

const applyFilters = async () => {
  page.value = 0;
  await loadDocuments();
};

const resetFilters = async () => {
  filters.status = '';
  filters.collectionName = '';
  filters.keyword = '';
  await applyFilters();
};

const changePage = async (nextPage) => {
  page.value = nextPage;
  await loadDocuments();
};

const openDetail = async (document) => {
  detailOpen.value = true;
  selectedDocument.value = document;

  try {
    selectedDocument.value = await api.getDocument(document.id);
  } catch (error) {
    errorMessage.value = error.message || '文档详情加载失败';
  }
};

const openDelete = (document) => {
  deleteTarget.value = document;
  deleteOpen.value = true;
};

const confirmDelete = async () => {
  if (!deleteTarget.value) {
    return;
  }

  deleteBusy.value = true;
  errorMessage.value = '';

  try {
    await api.deleteDocument(deleteTarget.value.id);
    deleteOpen.value = false;
    deleteTarget.value = null;
    await loadDocuments();
  } catch (error) {
    errorMessage.value = error.message || '删除失败';
  } finally {
    deleteBusy.value = false;
  }
};

const selectFile = (event) => {
  uploadFile.value = event.target.files?.[0] || null;
  uploadTitle.value = uploadFile.value?.name || '';
  uploadError.value = '';
};

const submitUpload = async () => {
  uploadError.value = '';

  if (!uploadFile.value) {
    uploadError.value = '请选择文档';
    return;
  }

  if (
    !['.md', '.txt'].some((extension) =>
      uploadFile.value.name.toLowerCase().endsWith(extension),
    )
  ) {
    uploadError.value = '仅支持 .md 和 .txt 文件';
    return;
  }

  if (uploadFile.value.size > 10 * 1024 * 1024) {
    uploadError.value = '文件不能超过 10 MB';
    return;
  }

  uploadBusy.value = true;

  try {
    await api.uploadDocument({
      file: uploadFile.value,
      collectionName: uploadCollection.value,
      title: uploadTitle.value,
    });
    uploadOpen.value = false;
    uploadFile.value = null;
    uploadTitle.value = '';
    await loadDocuments();
  } catch (error) {
    uploadError.value = error.message || '上传失败';
  } finally {
    uploadBusy.value = false;
  }
};

onMounted(loadDocuments);
</script>

<template>
  <section class="phase6-page">
    <header class="phase6-page-header">
      <div>
        <p class="phase6-eyebrow">KNOWLEDGE BASE</p>
        <h1>文档管理</h1>
        <p>管理知识库元数据、入库状态与文档生命周期。</p>
      </div>

      <button
        v-if="canWrite"
        type="button"
        class="phase6-button phase6-button--primary"
        @click="uploadOpen = true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M5 20h14" />
        </svg>
        上传文档
      </button>
    </header>

    <form class="phase6-filter-bar" @submit.prevent="applyFilters">
      <label class="phase6-field phase6-field--compact">
        <span>状态</span>
        <select v-model="filters.status">
          <option
            v-for="option in documentStatusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="phase6-field phase6-field--compact">
        <span>集合</span>
        <input v-model.trim="filters.collectionName" placeholder="集合名称" />
      </label>

      <label class="phase6-field phase6-field--grow">
        <span>关键字</span>
        <input
          v-model.trim="filters.keyword"
          placeholder="标题、来源或文件名"
        />
      </label>

      <div class="phase6-filter-actions">
        <button type="submit" class="phase6-button phase6-button--secondary">
          查询
        </button>
        <button
          type="button"
          class="phase6-button phase6-button--ghost"
          @click="resetFilters"
        >
          重置
        </button>
      </div>
    </form>

    <div v-if="errorMessage" class="phase6-alert phase6-alert--error">
      <span>{{ errorMessage }}</span>
      <button type="button" @click="loadDocuments">重试</button>
    </div>

    <div class="phase6-table-card">
      <div v-if="loading" class="phase6-loading-state">
        <span class="phase6-spinner" aria-hidden="true" />
        正在加载
      </div>

      <div v-else-if="documents.length === 0" class="phase6-empty-state">
        <strong>暂无文档</strong>
        <span>当前筛选条件下没有可显示的文档。</span>
      </div>

      <div v-else class="phase6-table-scroll">
        <table class="phase6-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>来源</th>
              <th>集合</th>
              <th>状态</th>
              <th class="phase6-number-cell">分块</th>
              <th>更新时间</th>
              <th class="phase6-action-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="document in documents" :key="document.id">
              <td>
                <strong class="phase6-primary-cell">
                  {{ document.title }}
                </strong>
                <span class="phase6-secondary-cell">
                  {{ document.fileName }}
                </span>
              </td>
              <td class="phase6-code-cell">
                {{ document.sourcePath }}
              </td>
              <td class="phase6-code-cell">
                {{ document.collectionName }}
              </td>
              <td>
                <StatusBadge :value="document.status" />
              </td>
              <td class="phase6-number-cell">
                {{ document.chunkCount }}
              </td>
              <td>{{ formatDate(document.updatedAt) }}</td>
              <td class="phase6-action-cell">
                <button
                  type="button"
                  class="phase6-icon-button"
                  aria-label="查看文档详情"
                  title="查看详情"
                  @click="openDetail(document)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
                    />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                </button>
                <button
                  v-if="canWrite"
                  type="button"
                  class="phase6-icon-button phase6-icon-button--danger"
                  aria-label="删除文档"
                  title="删除文档"
                  @click="openDelete(document)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    aria-hidden="true"
                  >
                    <path d="M4 7h16" />
                    <path d="M9 7V4h6v3" />
                    <path d="M7 7l1 13h8l1-13" />
                  </svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="phase6-pagination">
        <span>第 {{ page + 1 }} 页</span>
        <div>
          <button
            type="button"
            class="phase6-button phase6-button--secondary phase6-button--small"
            :disabled="!hasPrevious || loading"
            @click="changePage(page - 1)"
          >
            上一页
          </button>
          <button
            type="button"
            class="phase6-button phase6-button--secondary phase6-button--small"
            :disabled="!hasNext || loading"
            @click="changePage(page + 1)"
          >
            下一页
          </button>
        </div>
      </footer>
    </div>

    <ModalDialog
      :open="detailOpen"
      title="文档详情"
      @close="detailOpen = false"
    >
      <dl v-if="selectedDocument" class="phase6-detail-list">
        <div>
          <dt>文档键</dt>
          <dd>{{ selectedDocument.documentKey }}</dd>
        </div>
        <div>
          <dt>标题</dt>
          <dd>{{ selectedDocument.title }}</dd>
        </div>
        <div>
          <dt>来源路径</dt>
          <dd class="phase6-code-cell">
            {{ selectedDocument.sourcePath }}
          </dd>
        </div>
        <div>
          <dt>文件</dt>
          <dd>{{ selectedDocument.fileName }}</dd>
        </div>
        <div>
          <dt>集合</dt>
          <dd>{{ selectedDocument.collectionName }}</dd>
        </div>
        <div>
          <dt>内容哈希</dt>
          <dd class="phase6-code-cell">
            {{ selectedDocument.contentHash }}
          </dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd><StatusBadge :value="selectedDocument.status" /></dd>
        </div>
        <div>
          <dt>元数据</dt>
          <dd>
            <pre>{{ JSON.stringify(selectedDocument.metadata, null, 2) }}</pre>
          </dd>
        </div>
      </dl>
    </ModalDialog>

    <ModalDialog
      :open="uploadOpen"
      title="上传文档"
      @close="!uploadBusy && (uploadOpen = false)"
    >
      <form class="phase6-form" @submit.prevent="submitUpload">
        <label class="phase6-file-field">
          <input
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            :disabled="uploadBusy"
            @change="selectFile"
          />
          <span>选择文件</span>
          <strong>{{ uploadFile?.name || '支持 .md 和 .txt' }}</strong>
          <small v-if="uploadFile">
            {{ (uploadFile.size / 1024).toFixed(1) }} KB
          </small>
        </label>

        <label class="phase6-field">
          <span>标题</span>
          <input
            v-model.trim="uploadTitle"
            :disabled="uploadBusy"
            placeholder="文档标题"
          />
        </label>

        <label class="phase6-field">
          <span>目标集合</span>
          <input
            v-model.trim="uploadCollection"
            :disabled="uploadBusy"
            placeholder="virtual_utopia_rag"
          />
        </label>

        <p v-if="uploadError" class="phase6-form-error" role="alert">
          {{ uploadError }}
        </p>

        <div class="phase6-form-actions">
          <button
            type="button"
            class="phase6-button phase6-button--ghost"
            :disabled="uploadBusy"
            @click="uploadOpen = false"
          >
            取消
          </button>
          <button
            type="submit"
            class="phase6-button phase6-button--primary"
            :disabled="uploadBusy"
          >
            <span v-if="uploadBusy" class="phase6-spinner" aria-hidden="true" />
            {{ uploadBusy ? '处理中' : '上传' }}
          </button>
        </div>
      </form>
    </ModalDialog>

    <ModalDialog
      :open="deleteOpen"
      title="确认删除"
      @close="!deleteBusy && (deleteOpen = false)"
    >
      <div class="phase6-confirm-copy">
        <p>
          将删除文档
          <strong>{{ deleteTarget?.title }}</strong>
          的元数据。
        </p>
        <p class="phase6-code-cell">
          {{ deleteTarget?.sourcePath }}
        </p>
        <p>当前向量清理能力未启用，删除后仍可能保留Chroma向量。</p>
      </div>

      <template #footer>
        <button
          type="button"
          class="phase6-button phase6-button--ghost"
          :disabled="deleteBusy"
          @click="deleteOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="phase6-button phase6-button--danger"
          :disabled="deleteBusy"
          @click="confirmDelete"
        >
          {{ deleteBusy ? '删除中' : '确认删除' }}
        </button>
      </template>
    </ModalDialog>
  </section>
</template>
