<script setup>
// 门户左侧主视觉：山林田园聚落（纯装饰性 SVG，无业务逻辑）
</script>

<template>
  <svg
    class="vu-login-scene"
    viewBox="0 0 1200 800"
    preserveAspectRatio="xMidYMid slice"
    role="img"
    aria-label="山林田园聚落：层叠远山、清晨薄雾、田园地块与散落小屋"
  >
    <defs>
      <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d7e8e1" />
        <stop offset="0.55" stop-color="#e6efe6" />
        <stop offset="1" stop-color="#f4ecd8" />
      </linearGradient>
      <radialGradient id="ls-sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff3d6" stop-opacity="0.9" />
        <stop offset="1" stop-color="#fff3d6" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ls-far" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b9d0c7" />
        <stop offset="1" stop-color="#a4c0b3" />
      </linearGradient>
      <linearGradient id="ls-mid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8fb3a4" />
        <stop offset="1" stop-color="#719b8a" />
      </linearGradient>
      <linearGradient id="ls-near" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5e8670" />
        <stop offset="1" stop-color="#476c59" />
      </linearGradient>
      <linearGradient id="ls-meadow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9cf92" />
        <stop offset="1" stop-color="#8cbb7d" />
      </linearGradient>
      <linearGradient id="ls-plot" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#bcd89f" />
        <stop offset="1" stop-color="#99c586" />
      </linearGradient>
      <linearGradient id="ls-stream" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b8ddd5" />
        <stop offset="1" stop-color="#8fc5bb" />
      </linearGradient>
      <radialGradient id="ls-mist" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.5" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ls-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#93c07c" />
        <stop offset="1" stop-color="#7ba66a" />
      </linearGradient>

      <!-- 小木屋（茅草顶） -->
      <g id="ls-cottage">
        <rect x="-22" y="-16" width="44" height="19" rx="2" fill="#b0855c" />
        <path d="M -29 -16 L 0 -40 L 29 -16 Z" fill="#c9a24a" />
        <path d="M -29 -16 L 0 -40 L 29 -16 L 0 -24 Z" fill="#d3ab55" opacity="0.6" />
        <rect x="-5" y="-6" width="10" height="9" rx="1" fill="#5d4630" />
        <rect x="-16" y="-12" width="7" height="7" rx="1" fill="#9fc4b3" opacity="0.85" />
        <rect x="9" y="-12" width="7" height="7" rx="1" fill="#9fc4b3" opacity="0.85" />
        <rect x="-24" y="-2" width="48" height="4" rx="2" fill="#8a6f52" />
      </g>

      <!-- 石基亭台 -->
      <g id="ls-pavilion">
        <rect x="-27" y="-5" width="54" height="8" rx="3" fill="#c9c4b8" />
        <rect x="-20" y="-36" width="4" height="31" fill="#a97b4f" />
        <rect x="16" y="-36" width="4" height="31" fill="#a97b4f" />
        <rect x="-20" y="-37" width="40" height="4" fill="#a97b4f" />
        <path d="M -34 -35 Q 0 -60 34 -35 L 26 -35 Q 0 -52 -26 -35 Z" fill="#6f9a88" />
        <path d="M -36 -34 L 0 -55 L 36 -34 Q 0 -47 -36 -34 Z" fill="#7fa398" />
      </g>

      <!-- 书屋 -->
      <g id="ls-bookhouse">
        <rect x="-31" y="-26" width="62" height="28" rx="3" fill="#a97b4f" />
        <path d="M -38 -26 L 0 -50 L 38 -26 Z" fill="#8cbb7d" />
        <rect x="-7" y="-15" width="14" height="15" rx="1" fill="#5d4630" />
        <rect x="-25" y="-19" width="11" height="9" rx="1" fill="#9fc4b3" opacity="0.85" />
        <rect x="14" y="-19" width="11" height="9" rx="1" fill="#9fc4b3" opacity="0.85" />
        <rect x="-12" y="-46" width="24" height="11" rx="2" fill="#c9a24a" />
      </g>

      <!-- 圆冠树 -->
      <g id="ls-tree">
        <rect x="-3" y="0" width="6" height="17" fill="#7a5c3d" />
        <circle cx="0" cy="-16" r="17" fill="#5f8a5c" />
        <circle cx="-7" cy="-10" r="12" fill="#6f9a68" opacity="0.85" />
        <circle cx="7" cy="-11" r="11" fill="#6f9a68" opacity="0.7" />
      </g>

      <!-- 松树 -->
      <g id="ls-pine">
        <rect x="-3" y="0" width="6" height="20" fill="#7a5c3d" />
        <path d="M 0 -52 L 17 -22 L 8 -22 L 8 0 L -8 0 L -8 -22 L -17 -22 Z" fill="#4e7a5a" />
      </g>

      <!-- 地点标签底片 -->
      <linearGradient id="ls-tag" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#123228" stop-opacity="0.42" />
        <stop offset="1" stop-color="#123228" stop-opacity="0.42" />
      </linearGradient>
    </defs>

    <!-- 天空 -->
    <rect x="0" y="0" width="1200" height="800" fill="url(#ls-sky)" />

    <!-- 晨光 -->
    <ellipse cx="600" cy="210" rx="360" ry="180" fill="url(#ls-sun)" />

    <!-- 远景山（最淡） -->
    <g fill="url(#ls-far)">
      <path d="M -40 430 Q 120 300 280 380 Q 380 320 520 388 Q 640 330 760 384 Q 900 330 1040 390 Q 1160 360 1260 420 L 1260 520 L -40 520 Z" opacity="0.75" />
    </g>

    <!-- 晨雾带 1 -->
    <ellipse cx="300" cy="440" rx="420" ry="52" fill="url(#ls-mist)" />
    <ellipse cx="820" cy="452" rx="460" ry="56" fill="url(#ls-mist)" />

    <!-- 中景山 -->
    <g fill="url(#ls-mid)">
      <path d="M -40 520 Q 160 380 360 470 Q 470 410 620 480 Q 760 420 900 486 Q 1060 430 1260 500 L 1260 600 L -40 600 Z" opacity="0.9" />
    </g>

    <!-- 晨雾带 2 -->
    <ellipse cx="560" cy="520" rx="520" ry="48" fill="url(#ls-mist)" />
    <ellipse cx="160" cy="545" rx="360" ry="42" fill="url(#ls-mist)" />
    <ellipse cx="980" cy="545" rx="380" ry="44" fill="url(#ls-mist)" />

    <!-- 近景山林（森林剪影） -->
    <g fill="url(#ls-near)">
      <path d="M -40 620 Q 120 520 300 590 Q 420 545 560 600 Q 700 550 860 605 Q 1000 555 1260 610 L 1260 660 L -40 660 Z" />
    </g>
    <g fill="#3f5a4d" opacity="0.85">
      <circle cx="90" cy="590" r="22" />
      <circle cx="150" cy="575" r="26" />
      <circle cx="230" cy="585" r="20" />
      <circle cx="980" cy="585" r="24" />
      <circle cx="1060" cy="578" r="22" />
      <circle cx="1130" cy="590" r="18" />
    </g>

    <!-- 中心田园草坪地块 -->
    <g>
      <path
        d="M 180 620
           C 240 560 420 520 600 540
           C 790 560 960 560 1030 610
           C 1050 660 1000 720 900 740
           C 760 770 500 780 340 740
           C 230 710 170 670 180 620 Z"
        fill="url(#ls-meadow)"
        opacity="0.95"
      />
      <!-- 田埂（柔和地块分界） -->
      <g stroke="#7fae6e" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round">
        <path d="M 300 640 Q 460 600 620 620" />
        <path d="M 500 700 Q 560 640 600 600" />
        <path d="M 720 640 Q 820 630 930 650" />
        <path d="M 380 700 Q 480 730 600 720" />
        <path d="M 760 700 Q 840 720 920 710" />
      </g>
      <!-- 田园地块色块（更亮） -->
      <g fill="url(#ls-plot)" opacity="0.5">
        <ellipse cx="420" cy="665" rx="130" ry="55" />
        <ellipse cx="700" cy="675" rx="150" ry="58" />
      </g>
    </g>

    <!-- 浅溪流 -->
    <path
      d="M 640 470 C 620 520 660 560 700 590 C 730 615 690 660 640 700 C 600 730 620 760 660 790"
      fill="none"
      stroke="url(#ls-stream)"
      stroke-width="30"
      stroke-linecap="round"
      opacity="0.9"
    />
    <path
      d="M 640 470 C 620 520 660 560 700 590 C 730 615 690 660 640 700 C 600 730 620 760 660 790"
      fill="none"
      stroke="#dff2ec"
      stroke-width="6"
      stroke-linecap="round"
      opacity="0.55"
    />

    <!-- 石板小路（自然弯曲） -->
    <g fill="none" stroke="#d6cfc0" stroke-width="9" stroke-linecap="round" opacity="0.9">
      <path d="M 600 700 C 580 640 540 600 470 585 C 420 575 360 570 320 570" />
      <path d="M 620 690 C 640 640 680 620 730 600 C 770 585 830 585 880 590" />
      <path d="M 585 700 C 570 650 560 600 575 560 C 585 535 610 520 630 512" />
      <path d="M 640 690 C 670 660 720 640 760 630 C 800 620 830 610 850 600" />
    </g>
    <g fill="#c9c2b2" opacity="0.85">
      <ellipse cx="600" cy="700" rx="20" ry="9" />
      <ellipse cx="470" cy="585" rx="16" ry="8" />
      <ellipse cx="320" cy="570" rx="16" ry="8" />
      <ellipse cx="730" cy="600" rx="16" ry="8" />
      <ellipse cx="880" cy="590" rx="16" ry="8" />
      <ellipse cx="575" cy="560" rx="15" ry="8" />
      <ellipse cx="630" cy="512" rx="15" ry="8" />
      <ellipse cx="760" cy="630" rx="15" ry="8" />
    </g>

    <!-- 生活广场（中心小石坪） -->
    <g>
      <ellipse cx="610" cy="668" rx="70" ry="34" fill="#c9c4b8" opacity="0.9" />
      <ellipse cx="610" cy="668" rx="52" ry="24" fill="#d8d2c4" opacity="0.85" />
      <g stroke="#b5b0a4" stroke-width="3" opacity="0.5">
        <path d="M 560 668 H 660" />
        <path d="M 610 652 V 684" />
      </g>
    </g>

    <!-- 木桥（跨溪） -->
    <g transform="translate(672 592) rotate(-24)">
      <rect x="-26" y="-6" width="52" height="8" rx="2" fill="#a97b4f" />
      <rect x="-24" y="-18" width="4" height="14" fill="#8a6f52" />
      <rect x="20" y="-18" width="4" height="14" fill="#8a6f52" />
      <rect x="-24" y="-18" width="48" height="4" fill="#8a6f52" />
    </g>

    <!-- 建筑聚落 -->
    <use href="#ls-cottage" transform="translate(320 570)" />
    <use href="#ls-cottage" transform="translate(880 590)" />
    <use href="#ls-cottage" transform="translate(410 618)" />
    <use href="#ls-pavilion" transform="translate(560 552)" />
    <use href="#ls-bookhouse" transform="translate(760 610)" />
    <use href="#ls-cottage" transform="translate(470 668)" />

    <!-- 树木 -->
    <use href="#ls-tree" transform="translate(250 620)" />
    <use href="#ls-pine" transform="translate(220 640)" />
    <use href="#ls-tree" transform="translate(960 632)" />
    <use href="#ls-pine" transform="translate(1000 645)" />
    <use href="#ls-tree" transform="translate(520 560)" />
    <use href="#ls-pine" transform="translate(360 640)" />
    <use href="#ls-tree" transform="translate(850 548)" />
    <use href="#ls-pine" transform="translate(940 555)" />
    <use href="#ls-tree" transform="translate(140 660)" />
    <use href="#ls-pine" transform="translate(1080 660)" />

    <!-- 前景晨雾 -->
    <ellipse cx="180" cy="780" rx="340" ry="90" fill="url(#ls-mist)" />
    <ellipse cx="1020" cy="790" rx="360" ry="90" fill="url(#ls-mist)" />

    <!-- 地点标签 -->
    <g font-family="system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="17" letter-spacing="1">
      <g transform="translate(300 520)">
        <rect x="-46" y="-16" width="92" height="28" rx="14" fill="url(#ls-tag)" />
        <text x="0" y="4" text-anchor="middle" fill="#eef5ef" opacity="0.92">山林聚落</text>
      </g>
      <g transform="translate(705 452)">
        <rect x="-34" y="-16" width="68" height="28" rx="14" fill="url(#ls-tag)" />
        <text x="0" y="4" text-anchor="middle" fill="#eef5ef" opacity="0.92">书屋</text>
      </g>
      <g transform="translate(560 730)">
        <rect x="-46" y="-16" width="92" height="28" rx="14" fill="url(#ls-tag)" />
        <text x="0" y="4" text-anchor="middle" fill="#eef5ef" opacity="0.92">家园地块</text>
      </g>
      <g transform="translate(838 700)">
        <rect x="-46" y="-16" width="92" height="28" rx="14" fill="url(#ls-tag)" />
        <text x="0" y="4" text-anchor="middle" fill="#eef5ef" opacity="0.92">生活广场</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.vu-login-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
