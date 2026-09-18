export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 720;
export const ISO_TILE_WIDTH = 76;
export const ISO_TILE_HEIGHT = 38;
export const GRID_EXTENT = 8;

const ISO_ORIGIN = Object.freeze({
  x: 600,
  y: 280,
});

export const isoToWorld = (x, y) => ({
  x: ISO_ORIGIN.x + (x - y) * (ISO_TILE_WIDTH / 2),
  y: ISO_ORIGIN.y + (x + y) * (ISO_TILE_HEIGHT / 2),
});

export const scenePoints = Object.freeze([
  {
    key: 'yard',
    name: '大院',
    routeName: 'yard',
    position: isoToWorld(-3, -2),
  },
  {
    key: 'pavilion',
    name: '议事亭',
    routeName: 'pavilion',
    position: isoToWorld(2, -3),
  },
  {
    key: 'resource-wall',
    name: '资源墙',
    routeName: 'resource-wall',
    position: isoToWorld(-3, 2),
  },
  {
    key: 'library',
    name: '书屋',
    routeName: 'library',
    position: isoToWorld(4, 0),
  },
  {
    key: 'cabin',
    name: '小屋',
    routeName: 'cabin',
    position: isoToWorld(1, 5),
  },
  {
    key: 'far-forest',
    name: '远林',
    routeName: 'far-forest',
    position: isoToWorld(5, 4),
  },
]);
