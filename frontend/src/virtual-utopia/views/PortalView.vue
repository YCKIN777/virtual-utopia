<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { worldStore } from '../stores/worldStore.js';

const CONCEPT_KEY = 'vu-portal-concept-collapsed';

const collapsed = ref(
  (() => {
    try {
      return localStorage.getItem(CONCEPT_KEY) === '1';
    } catch {
      return false;
    }
  })(),
);

const isLoggedIn = () => Boolean(worldStore.state.user);

const toggleCollapse = () => {
  collapsed.value = !collapsed.value;
  try {
    localStorage.setItem(CONCEPT_KEY, collapsed.value ? '1' : '0');
  } catch {
    // 忽略（隐私模式等）
  }
};
</script>

<template>
  <main class="vu-portal">
    <section class="vu-portal-hero">
      <div class="vu-container vu-portal-hero__inner">
        <span class="vu-kicker">MOUNTAIN SETTLEMENT</span>
        <h1>五十户山林庄园城镇</h1>
        <p>一处平等、松弛的虚拟栖居空间，等待你从容踏入。</p>
        <div class="vu-portal-actions">
          <RouterLink
            :to="{ name: 'world' }"
            class="vu-button vu-button--accent vu-button--wide"
          >
            进入世界
          </RouterLink>
          <RouterLink
            v-if="isLoggedIn()"
            :to="{ name: 'profile' }"
            class="vu-button vu-button--light"
          >
            个人中心
          </RouterLink>
          <template v-else>
            <RouterLink
              :to="{ name: 'login' }"
              class="vu-button vu-button--light"
            >
              登录
            </RouterLink>
            <RouterLink
              :to="{ name: 'register' }"
              class="vu-button vu-button--light"
            >
              申请入驻
            </RouterLink>
          </template>
        </div>
      </div>
    </section>

    <section class="vu-portal-concept">
      <div class="vu-container">
        <button
          type="button"
          class="vu-portal-concept__toggle"
          :aria-expanded="!collapsed"
          @click="toggleCollapse"
        >
          <span class="vu-kicker">WORLDVIEW</span>
          <strong>虚拟乌托邦</strong>
          <span class="vu-portal-concept__toggle-hint" aria-hidden="true">
            {{ collapsed ? '展开' : '收起' }}
          </span>
        </button>

        <div v-if="!collapsed" class="vu-portal-concept__body">
          <p>
            在喧嚣物欲的现实之外，我们搭建了这片山林聚落。<br />
            这里没有利益纠葛，没有等级高低，没有竞争内卷。<br />
            它是一处平等、松弛的虚拟栖居空间。
          </p>
          <p>
            现实之中，信任弥足珍贵，却很难建立。<br />
            我们希望在这里，人们可以卸下功利的包袱，自愿相遇、从容交谈，慢慢重建人与人之间的信任。
          </p>
          <p>
            这里最多容纳 50 户原住民定居，每户拥有自己的家园；大家可以自主邀请友人前来做客漫游。<br />
            每个人拥有选择隐私边界的权利：可开门待客，亦可闭门独处。
          </p>
          <p>
            我们生活在这只属于我们自己的乌托邦，维护社群的善意与安宁。<br />
            这里没有胜负，没有交易，只有人与人简单真诚的相遇。
          </p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.vu-portal {
  min-height: calc(100vh - 60px);
  background:
    linear-gradient(180deg, rgba(19, 35, 31, 0.94), rgba(36, 79, 69, 0.88)),
    radial-gradient(1200px 600px at 50% -10%, #4d8a70, #13231f);
  color: #eef4ef;
}

.vu-portal-hero {
  padding: 96px 0 48px;
}

.vu-portal-hero__inner {
  display: grid;
  justify-items: center;
  gap: 14px;
  text-align: center;
}

.vu-portal-hero h1 {
  margin: 0;
  font-size: 34px;
  letter-spacing: 2px;
  color: #f3f7f4;
}

.vu-portal-hero p {
  margin: 0;
  max-width: 480px;
  color: #cfe0d6;
  font-size: 14px;
  line-height: 1.7;
}

.vu-portal-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 14px;
}

.vu-portal-concept {
  padding: 16px 0 72px;
}

.vu-portal-concept__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.vu-portal-concept__toggle strong {
  font-size: 20px;
  letter-spacing: 1px;
  color: #f4f7f4;
}

.vu-portal-concept__toggle-hint {
  margin-left: auto;
  color: #9fc2b0;
  font-size: 12px;
}

.vu-portal-concept__body {
  margin-top: 16px;
  padding: 22px 22px 26px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(13, 28, 25, 0.5);
}

.vu-portal-concept__body p {
  margin: 0 0 18px;
  color: #dbe8e0;
  font-size: 15px;
  line-height: 2;
}

.vu-portal-concept__body p:last-child {
  margin-bottom: 0;
}

@media (max-width: 760px) {
  .vu-portal-hero {
    padding: 64px 0 32px;
  }

  .vu-portal-hero h1 {
    font-size: 26px;
  }
}
</style>
