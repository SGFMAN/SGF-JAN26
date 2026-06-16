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

  const skinMat = regMat({
    color: skinColor,
    emissive: skinColor,
    emissiveIntensity: 0.12,
    roughness: 0.46,
    metalness: 0.02,
  });
  const clothMat = regMat({ color: clothColor, roughness: 0.7 });
  const darkClothMat = regMat({ color: darkClothColor, roughness: 0.72 });
  const jointMat = regMat({
    color: jointColor,
    emissive: jointColor,
    emissiveIntensity: 0.08,
    roughness: 0.52,
    metalness: 0.02,
  });

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

    const upperArmLen = 1.1;
    const elbowDrop = 1.19;
    const upperArmOutwardZ = Math.atan2(elbowLocalX, elbowDrop);

    const upperArmPivot = new THREE.Group();
    armPivot.add(upperArmPivot);
    upperArmPivot.rotation.z = upperArmOutwardZ;

    const upperArm = addBodyMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, upperArmLen, 14), clothMat),
      upperArmPivot
    );
    upperArm.position.set(0, -upperArmLen * 0.5, 0);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, -upperArmLen, 0);
    upperArmPivot.add(forearmPivot);

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

    const rig = {
      side,
      armPivot,
      upperArmPivot,
      forearmPivot,
      upperArm,
      hand,
      baseHandX: hand.rotation.x,
      baseUpperArmZ: upperArmOutwardZ,
    };
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
  skinColor: "#ffc4b0",
  clothColor: "#4f6bff",
  darkClothColor: "#2f3e7a",
  jointColor: "#e89888",
};

export function applyWalkCycle(armRig, legRig, walkPhase) {
  const armSwing = Math.sin(walkPhase) * 0.62;
  const elbowBend = Math.max(0, Math.sin(walkPhase + 0.4)) * 0.24;
  const legSwing = Math.sin(walkPhase) * 0.75;
  const kneeBend = Math.max(0, Math.sin(walkPhase + 0.2)) * 0.42;
  const footRock = Math.sin(walkPhase + 0.8) * 0.2;

  if (armRig.left && armRig.right) {
    armRig.left.armPivot.rotation.x = armSwing;
    armRig.right.armPivot.rotation.x = -armSwing;
    armRig.left.forearmPivot.rotation.x = -elbowBend;
    armRig.right.forearmPivot.rotation.x = -Math.max(0, -Math.sin(walkPhase + 0.4)) * 0.24;
    armRig.left.hand.rotation.x = -armSwing * 0.25;
    armRig.right.hand.rotation.x = armSwing * 0.25;
  }

  if (legRig.left && legRig.right) {
    legRig.left.legPivot.rotation.x = -legSwing;
    legRig.right.legPivot.rotation.x = legSwing;
    legRig.left.lowerLegPivot.rotation.x = kneeBend;
    legRig.right.lowerLegPivot.rotation.x = Math.max(0, -Math.sin(walkPhase + 0.2)) * 0.42;
    legRig.left.foot.rotation.x = legRig.left.baseFootX + footRock;
    legRig.right.foot.rotation.x = legRig.right.baseFootX - footRock;
  }
}

export function resetPose(armRig, legRig) {
  const reset = (current, target) => current + (target - current) * 0.15;
  const resetRot3 = (rot, tx, ty, tz) => {
    rot.x = reset(rot.x, tx);
    rot.y = reset(rot.y, ty);
    rot.z = reset(rot.z, tz);
  };
  if (armRig.left && armRig.right) {
    resetRot3(armRig.left.armPivot.rotation, 0, 0, 0);
    resetRot3(armRig.right.armPivot.rotation, 0, 0, 0);
    resetRot3(armRig.left.forearmPivot.rotation, 0, 0, 0);
    resetRot3(armRig.right.forearmPivot.rotation, 0, 0, 0);
    resetRot3(armRig.left.upperArmPivot?.rotation ?? armRig.left.upperArm.rotation, 0, 0, armRig.left.baseUpperArmZ ?? armRig.left.side * 0.22);
    resetRot3(armRig.right.upperArmPivot?.rotation ?? armRig.right.upperArm.rotation, 0, 0, armRig.right.baseUpperArmZ ?? armRig.right.side * 0.22);
    resetRot3(armRig.left.upperArm.rotation, 0, 0, 0);
    resetRot3(armRig.right.upperArm.rotation, 0, 0, 0);
    armRig.left.hand.rotation.x = reset(armRig.left.hand.rotation.x, armRig.left.baseHandX);
    armRig.right.hand.rotation.x = reset(armRig.right.hand.rotation.x, armRig.right.baseHandX);
  }
  if (legRig.left && legRig.right) {
    resetRot3(legRig.left.legPivot.rotation, legRig.left.baseLegPivotX, 0, 0);
    resetRot3(legRig.right.legPivot.rotation, legRig.right.baseLegPivotX, 0, 0);
    legRig.left.lowerLegPivot.rotation.x = reset(
      legRig.left.lowerLegPivot.rotation.x,
      legRig.left.baseLowerPivotX
    );
    legRig.right.lowerLegPivot.rotation.x = reset(
      legRig.right.lowerLegPivot.rotation.x,
      legRig.right.baseLowerPivotX
    );
    legRig.left.foot.rotation.x = reset(legRig.left.foot.rotation.x, legRig.left.baseFootX);
    legRig.right.foot.rotation.x = reset(legRig.right.foot.rotation.x, legRig.right.baseFootX);
  }
}
