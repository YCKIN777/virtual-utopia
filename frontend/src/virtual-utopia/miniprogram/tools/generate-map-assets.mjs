import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetsDirectory = path.resolve(toolsDirectory, '../assets');
const width = 1600;
const height = 760;

const terrainRenderer = `
  (night) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');
    const lerp = (start, end, value) => Math.round(start + (end - start) * value);
    const mix = (a, b, value) => {
      const parse = (hex) => Number.parseInt(hex.slice(1), 16);
      const from = parse(a);
      const to = parse(b);
      return '#' +
        [16, 8, 0]
          .map((shift) =>
            lerp((from >> shift) & 255, (to >> shift) & 255, value)
              .toString(16)
              .padStart(2, '0')
          )
          .join('');
    };
    const sky = ctx.createLinearGradient(0, 0, 0, 760);
    sky.addColorStop(0, night ? '#101c35' : '#bcdbe0');
    sky.addColorStop(0.48, night ? '#24374a' : '#dce9df');
    sky.addColorStop(1, night ? '#172a27' : '#8ca58f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1600, 760);

    const mountain = (points, fill, offset) => {
      ctx.save();
      ctx.translate(0, offset);
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    };

    mountain(
      [[-80, 510], [160, 235], [370, 430], [560, 210], [770, 445],
       [1000, 190], [1210, 420], [1450, 245], [1680, 520]],
      night ? '#1d322e' : '#55775d',
      54
    );
    mountain(
      [[-80, 570], [150, 330], [350, 500], [610, 285], [870, 525],
       [1120, 285], [1400, 490], [1680, 340]],
      night ? '#29483e' : '#6f9070',
      28
    );

    const terraces = [
      [[210, 520], [510, 300], [1030, 300], [1400, 520], [1110, 720], [470, 720]],
      [[300, 500], [560, 338], [1010, 338], [1310, 520], [1040, 665], [530, 665]],
      [[390, 492], [620, 370], [965, 370], [1200, 520], [980, 615], [590, 615]],
      [[470, 488], [665, 398], [915, 398], [1100, 520], [925, 575], [630, 575]]
    ];
    terraces.forEach((terrace, index) => {
      mountain(
        terrace,
        mix(night ? '#1e3931' : '#4e7458', night ? '#455e52' : '#9fb78d', index * 0.2),
        0
      );
      ctx.strokeStyle = night
        ? 'rgba(178, 220, 201, 0.16)'
        : 'rgba(228, 244, 228, 0.42)';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    for (let index = 0; index < 150; index += 1) {
      const angle = index * 2.39996;
      const radius = 280 + (index % 19) * 28;
      const x = 800 + Math.cos(angle) * radius;
      const y = 510 + Math.sin(angle) * radius * 0.38;

      if (x < 170 || x > 1430 || y < 210 || y > 680) {
        continue;
      }

      const size = 12 + (index % 7) * 3;
      ctx.fillStyle = night ? '#18372f' : '#285d43';
      ctx.beginPath();
      ctx.arc(x, y - size, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = night ? '#223d34' : '#3d7050';
      ctx.fillRect(x - 2, y - size * 0.25, 4, size + 8);
    }

    return canvas.toDataURL('image/webp', 0.82);
  }
`;

const infrastructureRenderer = `
  (night) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 760;
    const ctx = canvas.getContext('2d');
    const wood = night ? '#8e6d4d' : '#b78552';
    const woodDark = night ? '#624b38' : '#7d5b3e';
    const center = { x: 732, y: 424 };
    const beads = [
      [520, 310], [650, 250], [820, 240], [980, 330],
      [1040, 480], [950, 580], [760, 610], [560, 540],
      [430, 420], [500, 500]
    ];

    const drawBridge = (target, offset) => {
      ctx.beginPath();
      ctx.moveTo(center.x, center.y + 30);
      ctx.quadraticCurveTo(
        (center.x + target[0]) / 2 + offset,
        (center.y + target[1]) / 2 - 36,
        target[0],
        target[1]
      );
      ctx.strokeStyle = woodDark;
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = wood;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = night
        ? 'rgba(168, 239, 223, 0.42)'
        : 'rgba(255, 244, 213, 0.38)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 12]);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    beads.forEach((target, index) => {
      drawBridge(target, index % 2 === 0 ? -16 : 18);
    });

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.fillStyle = night ? 'rgba(83, 71, 54, 0.92)' : 'rgba(123, 89, 52, 0.82)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 168, 82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = woodDark;
    ctx.beginPath();
    ctx.ellipse(0, 2, 148, 72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.ellipse(0, -10, 128, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = night
      ? 'rgba(104, 174, 163, 0.84)'
      : 'rgba(170, 222, 214, 0.76)';
    ctx.beginPath();
    ctx.ellipse(0, -28, 94, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = night ? '#e2c383' : '#f5e6bd';
    ctx.beginPath();
    ctx.arc(0, -34, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -28, 118, 56, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    return canvas.toDataURL('image/webp', 0.82);
  }
`;

const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
});

try {
  await mkdir(assetsDirectory, {
    recursive: true,
  });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  for (const mode of ['day', 'night']) {
    const isNight = mode === 'night';
    const terrainData = await page.evaluate(
      `(${terrainRenderer})(${JSON.stringify(isNight)})`,
    );
    const infrastructureData = await page.evaluate(
      `(${infrastructureRenderer})(${JSON.stringify(isNight)})`,
    );
    await writeFile(
      path.join(assetsDirectory, `terrain-${mode}.webp`),
      Buffer.from(terrainData.split(',')[1], 'base64'),
    );
    await writeFile(
      path.join(assetsDirectory, `infrastructure-${mode}.webp`),
      Buffer.from(infrastructureData.split(',')[1], 'base64'),
    );
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify({
    width,
    height,
    files: [
      'terrain-day.webp',
      'terrain-night.webp',
      'infrastructure-day.webp',
      'infrastructure-night.webp',
    ],
  }),
);
