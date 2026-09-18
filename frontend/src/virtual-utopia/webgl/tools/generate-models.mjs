import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
  constructor() {
    this.result = null;
    this.onload = null;
    this.onloadend = null;
  }

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onload?.();
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString(
        'base64',
      )}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
}

globalThis.FileReader = NodeFileReader;

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(toolsDirectory, '../models');

const material = (color, options = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.02,
    ...options,
  });

const createTreeModel = () => {
  const group = new THREE.Group();
  group.name = 'tree';

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, 2.4, 7),
    material('#6c4d35'),
  );
  trunk.position.y = 1.2;
  group.add(trunk);

  const canopy = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.35, 1),
    material('#2f704f'),
  );
  canopy.scale.set(1, 1.35, 1);
  canopy.position.y = 3.15;
  group.add(canopy);

  return group;
};

const createWoodManorModel = (variant) => {
  const group = new THREE.Group();
  group.name = `${variant}-manor`;

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(
      variant === 'cliff' ? 1.45 : 1.75,
      variant === 'cliff' ? 1.7 : 2,
      0.36,
      10,
    ),
    material('#79583b'),
  );
  base.position.y = 0.18;
  group.add(base);

  const wallHeight =
    variant === 'forest' ? 1.35 : variant === 'cliff' ? 1.6 : 1.85;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(
      variant === 'cliff' ? 3.05 : 3.5,
      wallHeight,
      variant === 'cliff' ? 2 : 2.35,
    ),
    material(variant === 'forest' ? '#815c38' : '#9c7044'),
  );
  wall.position.y = 0.36 + wallHeight / 2;
  group.add(wall);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.82, 0.08),
    material('#78b7ae', {
      transparent: true,
      opacity: 0.68,
      roughness: 0.18,
    }),
  );
  glass.position.set(0.36, 1.12, 1.22);
  group.add(glass);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(variant === 'cliff' ? 2.55 : 2.85, 1.25, 4, 1),
    material('#62452f'),
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.36 + wallHeight + 0.56;
  group.add(roof);

  const roofGarden = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 10, 7),
    material('#3f774d'),
  );
  roofGarden.scale.set(1.2, 0.24, 0.95);
  roofGarden.position.set(-0.25, 2.25, -0.25);
  group.add(roofGarden);

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(
      variant === 'cliff' ? 4.5 : 3.8,
      0.22,
      variant === 'cliff' ? 1.4 : 1.75,
    ),
    material('#ac7d4c'),
  );
  platform.position.set(
    variant === 'cliff' ? 0.4 : 0.08,
    0.38,
    variant === 'cliff' ? 1.45 : 1.3,
  );
  group.add(platform);

  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, wallHeight + 0.5, 6),
      material('#694a31'),
    );
    beam.position.set(side * 1.48, 0.36 + wallHeight / 2, 1.05);
    group.add(beam);
  }

  if (variant === 'cliff') {
    for (const side of [-1, 1]) {
      const support = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.13, 3.4, 6),
        material('#694a31'),
      );
      support.position.set(side * 1.0, -1.15, 1.15);
      support.rotation.z = side * 0.38;
      group.add(support);
    }
  }

  if (variant === 'terrace') {
    for (let index = -1; index <= 1; index += 1) {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 1.1, 5),
        material('#6d4a30'),
      );
      rail.position.set(index * 1.25, 0.92, 2.12);
      group.add(rail);
    }
  }

  if (variant === 'forest') {
    const mossWall = new THREE.Mesh(
      new THREE.BoxGeometry(3.75, 0.22, 2.5),
      material('#416f45'),
    );
    mossWall.position.y = 0.28;
    group.add(mossWall);
  }

  return group;
};

const createBridgeModel = () => {
  const group = new THREE.Group();
  group.name = 'bridge-segment';

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.24, 1.4),
    material('#a87b4c'),
  );
  group.add(deck);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 4, 6),
      material('#775638'),
    );
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.72, side * 0.62);
    group.add(rail);

    for (let index = -1; index <= 1; index += 1) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 0.9, 6),
        material('#775638'),
      );
      post.position.set(index * 1.45, 0.42, side * 0.62);
      group.add(post);
    }
  }

  return group;
};

const exportModel = (object, fileName) =>
  new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      object,
      (result) => {
        resolve(result);
      },
      (error) => reject(error),
      {
        binary: true,
        onlyVisible: true,
        trs: false,
      },
    );
  });

await mkdir(outputDirectory, {
  recursive: true,
});

const models = [
  ['tree.glb', createTreeModel()],
  ['cliff-manor.glb', createWoodManorModel('cliff')],
  ['forest-manor.glb', createWoodManorModel('forest')],
  ['terrace-manor.glb', createWoodManorModel('terrace')],
  ['bridge-segment.glb', createBridgeModel()],
];

for (const [fileName, object] of models) {
  const result = await exportModel(object, fileName);
  await writeFile(path.join(outputDirectory, fileName), Buffer.from(result));
}

console.log(JSON.stringify(models.map(([fileName]) => fileName)));
