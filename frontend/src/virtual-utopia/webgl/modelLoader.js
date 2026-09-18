import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

const loadModel = (url) =>
  new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (!child.isMesh) {
            return;
          }

          child.castShadow = true;
          child.receiveShadow = true;
          if (Array.isArray(child.material)) {
            child.material = child.material.map((item) => item.clone());
          } else if (child.material) {
            child.material = child.material.clone();
          }
        });
        resolve(gltf.scene);
      },
      undefined,
      reject,
    );
  });

export const loadWorldModels = async () => {
  const [tree, cliffManor, forestManor, terraceManor, bridgeSegment] =
    await Promise.all([
      loadModel(new URL('./models/tree.glb', import.meta.url).href),
      loadModel(new URL('./models/cliff-manor.glb', import.meta.url).href),
      loadModel(new URL('./models/forest-manor.glb', import.meta.url).href),
      loadModel(new URL('./models/terrace-manor.glb', import.meta.url).href),
      loadModel(new URL('./models/bridge-segment.glb', import.meta.url).href),
    ]);

  return {
    tree,
    cliffManor,
    forestManor,
    terraceManor,
    bridgeSegment,
  };
};
