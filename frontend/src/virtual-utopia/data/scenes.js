export const scenes = Object.freeze([
  {
    id: 'yard',
    name: '大院',
    englishName: 'YARD',
    category: '公共空间',
    summary: '连接各方来客的开放庭院，也是每日消息与协作任务的起点。',
    background:
      '大院位于虚拟乌托邦的中心地带。它既是居民交换近况的公共客厅，也是跨场景协作任务的分发节点。稳定、开放、可被所有居民抵达。',
    accent: '#b75b47',
    position: '44% 42%',
    unlockedByDefault: true,
    events: [
      {
        id: 'yard-daily',
        title: '每日世界简报',
        type: '事件',
        reward: '声望 +10',
        description: '收集今日场景动态并完成一次公共留言。',
      },
      {
        id: 'yard-welcome',
        title: '新居民引路',
        type: '任务',
        reward: '地图碎片 ×1',
        description: '帮助新居民熟悉地图入口和场景规则。',
      },
    ],
  },
  {
    id: 'pavilion',
    name: '议事亭',
    englishName: 'PAVILION',
    category: '公共空间',
    summary: '围绕共同议题展开讨论、形成决议并推动世界演进。',
    background:
      '议事亭记录社区提出的议题与共识。重要事件会在这里生成阶段议程，居民可以参与讨论并追踪决议的执行进度。',
    accent: '#596fb4',
    position: '64% 45%',
    unlockedByDefault: false,
    events: [
      {
        id: 'pavilion-council',
        title: '本周议事会',
        type: '事件',
        reward: '议题票 +1',
        description: '阅读当前议案并提交一次立场选择。',
      },
      {
        id: 'pavilion-record',
        title: '整理决议档案',
        type: '任务',
        reward: '声望 +15',
        description: '将近期讨论结果归档为可检索的公开记录。',
      },
    ],
  },
  {
    id: 'resource-wall',
    name: '资源墙',
    englishName: 'RESOURCE WALL',
    category: '知识空间',
    summary: '集中展示共享资料、工具与知识线索。',
    background:
      '资源墙是乌托邦的知识交换站。文档、经验和工具经过整理后在这里公开，供不同场景的居民检索和复用。',
    accent: '#2e8c7a',
    position: '32% 52%',
    unlockedByDefault: true,
    events: [
      {
        id: 'resource-map',
        title: '知识索引更新',
        type: '任务',
        reward: '资源积分 +20',
        description: '为任意一份共享文档补充准确标签和摘要。',
      },
      {
        id: 'resource-review',
        title: '资源质量巡检',
        type: '事件',
        reward: '查验凭证 ×1',
        description: '检查近期收录内容的来源与可访问状态。',
      },
    ],
  },
  {
    id: 'library',
    name: '书屋',
    englishName: 'LIBRARY',
    category: '知识空间',
    summary: '安静阅读、整理记忆，并发现世界档案中的隐藏线索。',
    background:
      '书屋保存乌托邦的历史、故事与长期记忆。居民可以在此阅读场景档案，也能提交新的注释与发现。',
    accent: '#9a6a35',
    position: '55% 72%',
    unlockedByDefault: true,
    events: [
      {
        id: 'library-archive',
        title: '遗落档案',
        type: '任务',
        reward: '故事片段 ×1',
        description: '从旧档案中寻找与远林相关的缺失记录。',
      },
      {
        id: 'library-circle',
        title: '共读时刻',
        type: '事件',
        reward: '知识值 +8',
        description: '参与一次短篇共读并留下阅读札记。',
      },
    ],
  },
  {
    id: 'cabin',
    name: '小屋',
    englishName: 'CABIN',
    category: '生活空间',
    summary: '保留私人对话与个人记忆的独立生活空间。',
    background:
      '小屋属于每位居民自己的安静角落。它承载私人会话、个人目标与不适合公开的思考轨迹。',
    accent: '#a54f70',
    position: '46% 76%',
    unlockedByDefault: false,
    events: [
      {
        id: 'cabin-diary',
        title: '今日留白',
        type: '任务',
        reward: '心情印记 ×1',
        description: '记录今天最值得保留的一段文字。',
      },
      {
        id: 'cabin-plan',
        title: '个人计划复盘',
        type: '事件',
        reward: '专注值 +12',
        description: '查看本周目标并标记一个可继续推进的方向。',
      },
    ],
  },
  {
    id: 'far-forest',
    name: '远林',
    englishName: 'FAR FOREST',
    category: '探索空间',
    summary: '尚未完全开放的世界边缘，新的地图与故事正在生成。',
    background:
      '远林是虚拟乌托邦的扩展边界。探索记录、环境变化和未知事件会共同决定它后续开放的方式。',
    accent: '#4d7a45',
    position: '58% 86%',
    unlockedByDefault: false,
    events: [
      {
        id: 'forest-trace',
        title: '边缘信号',
        type: '事件',
        reward: '探索点 +5',
        description: '标记一次来自远林边界的微弱信号。',
      },
      {
        id: 'forest-scout',
        title: '外围踏勘',
        type: '任务',
        reward: '未知契约 ×1',
        description: '整理远林开放前需要确认的环境信息。',
      },
    ],
  },
]);

export const worldUpdates = Object.freeze([
  {
    id: 'update-1',
    date: '09.16',
    tag: '世界事件',
    title: '六处场景完成坐标校准',
    description: '场景入口重新同步，公共空间与生活空间的连接更加稳定。',
  },
  {
    id: 'update-2',
    date: '09.15',
    tag: '知识协作',
    title: '资源索引新增 24 条记录',
    description: '居民围绕场景规则、任务线索和历史档案进行了集中整理。',
  },
  {
    id: 'update-3',
    date: '09.14',
    tag: '边界探索',
    title: '远林出现新的环境信号',
    description: '探索记录已进入议事亭议程，开放时间仍待确认。',
  },
]);

export const getSceneById = (sceneId) =>
  scenes.find((scene) => scene.id === sceneId) || null;
