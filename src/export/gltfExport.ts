import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { VoxelData } from '../viewer/voxelizer';

function sanitizeFileBase(name: string): string {
  const trimmed = name.trim();
  const safe = trimmed
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return safe || 'export';
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function createExportableVoxelMesh(voxelData: VoxelData): THREE.Group {
  const source = voxelData.mesh;
  const sourceGeometry = source.geometry;
  const posAttr = sourceGeometry.getAttribute('position');
  const normAttr = sourceGeometry.getAttribute('normal');
  const uvAttr = sourceGeometry.getAttribute('uv');
  const indexAttr = sourceGeometry.getIndex();
  if (!posAttr || !normAttr || !indexAttr) {
    throw new Error('Voxel source geometry is missing required attributes.');
  }

  const vertexCount = posAttr.count;
  const indexCount = indexAttr.count;
  const positionArray: number[] = [];
  const normalArray: number[] = [];
  const colorArray: number[] = [];
  const uvArray: number[] = [];
  const indexArray: number[] = [];
  const tempMatrix = new THREE.Matrix4();
  const tempPos = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();
  const tempWorldPos = new THREE.Vector3();
  const tempWorldNormal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const tempColor = new THREE.Color(1, 1, 1);
  const sourceColor = new THREE.Color();
  const exportGroup = new THREE.Group();
  exportGroup.name = source.name || 'VoxelProxy';
  let activeCount = 0;

  for (let i = 0; i < source.count; i += 1) {
    source.getMatrixAt(i, tempMatrix);
    tempMatrix.decompose(tempPos, tempQuat, tempScale);
    if (Math.abs(tempScale.x) < 1e-6 || Math.abs(tempScale.y) < 1e-6 || Math.abs(tempScale.z) < 1e-6) {
      continue;
    }

    normalMatrix.getNormalMatrix(tempMatrix);
    const explicitColor = voxelData.baseIndexToColor[i];
    if (explicitColor) sourceColor.copy(explicitColor);
    else if (source.instanceColor) source.getColorAt(i, sourceColor);
    else sourceColor.set(1, 1, 1);

    const baseVertex = positionArray.length / 3;
    for (let v = 0; v < vertexCount; v += 1) {
      tempWorldPos.set(posAttr.getX(v), posAttr.getY(v), posAttr.getZ(v)).applyMatrix4(tempMatrix);
      positionArray.push(tempWorldPos.x, tempWorldPos.y, tempWorldPos.z);

      tempWorldNormal.set(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v)).applyMatrix3(normalMatrix).normalize();
      normalArray.push(tempWorldNormal.x, tempWorldNormal.y, tempWorldNormal.z);

      tempColor.copy(sourceColor);
      colorArray.push(tempColor.r, tempColor.g, tempColor.b);

      if (uvAttr) uvArray.push(uvAttr.getX(v), uvAttr.getY(v));
    }

    for (let idx = 0; idx < indexCount; idx += 1) {
      indexArray.push(baseVertex + indexAttr.getX(idx));
    }
    activeCount += 1;
  }

  if (activeCount === 0) {
    throw new Error('No active voxels to export.');
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positionArray, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normalArray, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
  if (uvArray.length > 0) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));
  merged.setIndex(indexArray);

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 1 });
  const mergedMesh = new THREE.Mesh(merged, material);
  mergedMesh.name = `${exportGroup.name}_Merged`;
  exportGroup.add(mergedMesh);
  exportGroup.updateMatrixWorld(true);
  exportGroup.userData.activeVoxelCount = activeCount;
  return exportGroup;
}

async function exportSceneToGlb(scene: THREE.Scene): Promise<Blob> {
  const exporter = new GLTFExporter();
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (output) => {
        if (output instanceof ArrayBuffer) {
          resolve(output);
          return;
        }
        reject(new Error('GLTF exporter returned JSON output while binary was requested.'));
      },
      (error) => reject(error),
      {
        binary: true,
        onlyVisible: true,
        trs: false
      }
    );
  });

  return new Blob([result], { type: 'model/gltf-binary' });
}

export async function exportObjectAsGlb(object: THREE.Object3D, outputBaseName: string): Promise<void> {
  const exportScene = new THREE.Scene();
  exportScene.add(object.clone(true));
  const blob = await exportSceneToGlb(exportScene);
  triggerDownload(blob, `${sanitizeFileBase(outputBaseName)}.glb`);
}

export async function exportObjectsAsGlb(objects: THREE.Object3D[], outputBaseName: string): Promise<void> {
  if (objects.length === 0) {
    throw new Error('No objects selected for export.');
  }

  const exportScene = new THREE.Scene();
  for (const object of objects) {
    exportScene.add(object.clone(true));
  }

  const blob = await exportSceneToGlb(exportScene);
  triggerDownload(blob, `${sanitizeFileBase(outputBaseName)}.glb`);
}
