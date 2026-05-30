import * as THREE from "three";

/**
 * Same rig as the Night Walker playable character; optional head-lamp block for the hero only.
 * Each instance owns its own geometries and materials.
 */
export function createHumanoidRig({ skinColor, clothColor, darkClothColor, jointColor, withHeadLamp }) {
  const group = new THREE.Group();
  const bodyMeshes = [];
  const materials = [];
  const regMat = (params) => {
    const m = new THREE.MeshStandardMaterial(params);
    materials.push(m);
    return m;
  };

  const skinMat = regMat({ color: skinColor, roughness: 0.78 });
  const clothMat = regMat({ color: clothColor, roughness: 0.7 });
  const darkClothMat = regMat({ color: darkClothColor, roughness: 0.72 });
  const jointMat = regMat({ color: jointColor, roughness: 0.82 });

  const addBodyMesh = (mesh, parent = group) => {
    bodyMeshes.push(mesh);
    parent.add(mesh);
    return mesh;
  };

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 3.1, 20), clothMat);
  torso.position.y = 1.55;
  addBodyMesh(torso);

  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.7, 20), darkClothMat);
  hips.position.y = -0.2;
  addBodyMesh(hips);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.55, 16), jointMat);
  neck.position.y = 3.35;
  addBodyMesh(neck);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.9, 20), skinMat);
  head.position.y = 4.03;
  addBodyMesh(head);
  const headTopOffsetY = head.position.y + 0.5;

  let headLampPivot = null;

  if (withHeadLamp) {
    const strapMat = regMat({ color: "#1a1e28", roughness: 0.85 });
    const headStrap = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 28, Math.PI * 1.15), strapMat);
    headStrap.rotation.x = Math.PI / 2;
    headStrap.position.set(0, 0.32, 0.02);
    addBodyMesh(headStrap, head);

    const lampHousingMat = regMat({ color: "#2a303c", metalness: 0.35, roughness: 0.45 });
    const lampLensMat = regMat({
      color: "#ffe9c8",
      emissive: "#ffaa66",
      emissiveIntensity: 0.85,
      roughness: 0.28,
      metalness: 0.08,
    });
    headLampPivot = new THREE.Group();
    headLampPivot.position.set(0.06, 0.38, 0.44);
    head.add(headLampPivot);
    const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.22, 16), lampHousingMat);
    lampHousing.rotation.x = Math.PI / 2;
    addBodyMesh(lampHousing, headLampPivot);
    const lampLens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), lampLensMat);
    lampLens.position.z = 0.12;
    addBodyMesh(lampLens, headLampPivot);
  }

  const armRig = { left: null, right: null };
  const legRig = { left: null, right: null };

  const buildArm = (side) => {
    const elbowX = 1.05 * side;
    const shoulderX = 0.78 * side;
    const elbowLocalX = elbowX - shoulderX;

    const armPivot = new THREE.Group();
    armPivot.position.set(shoulderX, 2.85, 0);
    group.add(armPivot);

    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 16), clothMat), armPivot);
    const upperArm = addBodyMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 1.1, 14), clothMat),
      armPivot
    );
    upperArm.position.set(elbowLocalX * 0.5, -0.64, 0);
    upperArm.rotation.z = side * 0.22;

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(elbowLocalX, -1.29, 0);
    armPivot.add(forearmPivot);

    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 14), clothMat), forearmPivot);
    addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.0, 14), clothMat), forearmPivot).position.set(
      0,
      -0.61,
      0
    );
    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), jointMat), forearmPivot).position.set(0, -1.14, 0);

    const hand = addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 12), skinMat), forearmPivot);
    hand.position.set(0.06 * side, -1.39, 0.02);
    hand.rotation.z = Math.PI / 2;

    const rig = { side, armPivot, forearmPivot, upperArm, hand, baseHandX: hand.rotation.x };
    if (side > 0) armRig.right = rig;
    else armRig.left = rig;
  };

  const buildLeg = (side) => {
    const x = 0.5 * side;
    const legPivot = new THREE.Group();
    legPivot.position.set(x, -0.58, 0);
    group.add(legPivot);

    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 14), darkClothMat), legPivot);

    addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 1.45, 14), darkClothMat), legPivot).position.set(
      0,
      -0.76,
      0
    );

    const lowerLegPivot = new THREE.Group();
    lowerLegPivot.position.set(0, -1.52, 0);
    legPivot.add(lowerLegPivot);

    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 14), darkClothMat), lowerLegPivot);
    addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.35, 14), darkClothMat), lowerLegPivot).position.set(
      0,
      -0.76,
      0
    );
    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), jointMat), lowerLegPivot).position.set(0, -1.45, 0.06);

    const foot = addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 14), darkClothMat), lowerLegPivot);
    foot.position.set(0, -1.7, 0.35);
    foot.rotation.x = Math.PI / 2;

    const rig = {
      side,
      legPivot,
      lowerLegPivot,
      foot,
      baseFootX: foot.rotation.x,
      baseLegPivotX: legPivot.rotation.x,
      baseLowerPivotX: lowerLegPivot.rotation.x,
    };
    if (side > 0) legRig.right = rig;
    else legRig.left = rig;
  };

  buildArm(1);
  buildArm(-1);
  buildLeg(1);
  buildLeg(-1);

  return {
    group,
    bodyMeshes,
    materials,
    armRig,
    legRig,
    head,
    headTopOffsetY,
    headLampPivot,
    skinMat,
    jointMat,
    clothMat,
    darkClothMat,
  };
}

/** Night Walker hero palette (head-lamp character). */
export const NIGHT_WALKER_HERO_COLORS = {
  skinColor: "#f5e0cc",
  clothColor: "#4f6bff",
  darkClothColor: "#2f3e7a",
  jointColor: "#edd4bc",
};
