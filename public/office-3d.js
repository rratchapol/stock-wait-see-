import * as THREE from "three";

const statusColors = {
  idle: 0x8aa0ad,
  working: 0x2d6f9f,
  success: 0x168458,
  warning: 0xb67718,
  error: 0xbd4242,
};

export function mountOfficeScene(container, agents) {
  if (!container) return () => {};

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f5f7);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 6.4, 8.8);
  camera.lookAt(0, 0.65, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xffffff, 0xb8c6c4, 1.8);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  scene.add(sun);

  const floor = mesh(new THREE.BoxGeometry(10, 0.18, 6.2), 0xdfe7e4);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);

  const backWall = mesh(new THREE.BoxGeometry(10, 3.5, 0.14), 0xf8faf9);
  backWall.position.set(0, 1.65, -3.1);
  scene.add(backWall);

  const rug = mesh(new THREE.BoxGeometry(8.8, 0.04, 4.8), 0xcbd8d6);
  rug.position.set(0, 0.02, 0);
  scene.add(rug);

  const positions = [
    [-3.3, 0, -1.35],
    [-1.1, 0, -1.35],
    [1.1, 0, -1.35],
    [3.3, 0, -1.35],
  ];

  const workers = agents.map((agent, index) => {
    const group = createAgent(agent, index);
    group.position.set(...positions[index % positions.length]);
    scene.add(group);
    return group;
  });

  addOfficeProps(scene);

  let frameId = null;
  const clock = new THREE.Clock();

  function resize() {
    const rect = container.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(360, rect.height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function animate() {
    const time = clock.getElapsedTime();
    workers.forEach((worker, index) => animateAgent(worker, time, index));
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(animate);
  }

  resize();
  animate();
  window.addEventListener("resize", resize);

  return () => {
    window.removeEventListener("resize", resize);
    if (frameId) cancelAnimationFrame(frameId);
    renderer.dispose();
    container.innerHTML = "";
  };
}

function createAgent(agent, index) {
  const group = new THREE.Group();
  group.userData.agentStatus = agent.status;

  const accent = statusColors[agent.status] ?? statusColors.idle;
  const desk = mesh(new THREE.BoxGeometry(1.6, 0.16, 0.78), 0xb7a17a);
  desk.position.set(0, 0.74, 0);
  desk.castShadow = true;
  group.add(desk);

  const legGeometry = new THREE.BoxGeometry(0.12, 0.7, 0.12);
  [-0.62, 0.62].forEach((x) => {
    [-0.26, 0.26].forEach((z) => {
      const leg = mesh(legGeometry, 0x8d7857);
      leg.position.set(x, 0.35, z);
      group.add(leg);
    });
  });

  const chair = mesh(new THREE.BoxGeometry(0.62, 0.2, 0.56), 0x33444f);
  chair.position.set(0, 0.48, 0.72);
  group.add(chair);

  const body = mesh(new THREE.CapsuleGeometry(0.25, 0.42, 5, 10), accent);
  body.position.set(0, 1.14, 0.54);
  body.rotation.x = -0.12;
  group.add(body);

  const head = mesh(new THREE.SphereGeometry(0.24, 24, 16), 0xf0c7a5);
  head.position.set(0, 1.62, 0.48);
  group.add(head);
  group.userData.head = head;

  const hair = mesh(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x2d2725);
  hair.position.set(0, 1.74, 0.47);
  group.add(hair);

  const armGeometry = new THREE.CapsuleGeometry(0.055, 0.42, 4, 8);
  const leftArm = mesh(armGeometry, 0xf0c7a5);
  leftArm.position.set(-0.26, 1.09, 0.22);
  leftArm.rotation.set(1.08, 0.18, -0.32);
  group.add(leftArm);
  group.userData.leftArm = leftArm;

  const rightArm = mesh(armGeometry, 0xf0c7a5);
  rightArm.position.set(0.26, 1.09, 0.22);
  rightArm.rotation.set(1.08, -0.18, 0.32);
  group.add(rightArm);
  group.userData.rightArm = rightArm;

  const laptopBase = mesh(new THREE.BoxGeometry(0.62, 0.035, 0.42), 0x25323a);
  laptopBase.position.set(0, 0.85, -0.04);
  group.add(laptopBase);

  const laptopScreen = mesh(new THREE.BoxGeometry(0.62, 0.42, 0.035), 0x20313a);
  laptopScreen.position.set(0, 1.08, -0.26);
  laptopScreen.rotation.x = -0.18;
  group.add(laptopScreen);

  const screenGlow = mesh(new THREE.BoxGeometry(0.5, 0.3, 0.012), 0x9bd1ff, true);
  screenGlow.position.set(0, 1.08, -0.285);
  screenGlow.rotation.x = -0.18;
  group.add(screenGlow);

  const namePlate = mesh(new THREE.BoxGeometry(1.1, 0.08, 0.05), accent);
  namePlate.position.set(0, 0.88, 0.4);
  group.add(namePlate);

  const chart = createMiniChart(accent, index);
  chart.position.set(0.45, 1.32, -0.38);
  group.add(chart);

  return group;
}

function animateAgent(worker, time, index) {
  const status = worker.userData.agentStatus;
  const speed = status === "working" ? 4.2 : status === "warning" ? 2.6 : 1.6;
  const phase = index * 0.85;
  worker.userData.head.rotation.y = Math.sin(time * speed + phase) * 0.16;
  worker.userData.head.position.y = 1.62 + Math.sin(time * speed * 0.75 + phase) * 0.025;
  worker.userData.leftArm.rotation.z = -0.32 + Math.sin(time * speed + phase) * 0.16;
  worker.userData.rightArm.rotation.z = 0.32 - Math.sin(time * speed + phase) * 0.16;
  worker.position.y = Math.sin(time * 1.2 + phase) * 0.018;
}

function createMiniChart(color, index) {
  const group = new THREE.Group();
  const barGeometry = new THREE.BoxGeometry(0.06, 1, 0.04);
  [0.16, 0.28, 0.22, 0.38, 0.3].forEach((height, barIndex) => {
    const bar = mesh(barGeometry, barIndex % 2 === 0 ? color : 0x7b8b88);
    bar.scale.y = height;
    bar.position.set(barIndex * 0.09, height / 2, 0);
    group.add(bar);
  });
  group.rotation.y = -0.18 + index * 0.04;
  return group;
}

function addOfficeProps(scene) {
  const plantStem = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 10), 0x2f6847);
  plantStem.position.set(-4.65, 0.55, -2.45);
  scene.add(plantStem);

  const plantPot = mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.28, 16), 0xb67718);
  plantPot.position.set(-4.65, 0.18, -2.45);
  scene.add(plantPot);

  const leafGeometry = new THREE.SphereGeometry(0.18, 12, 8);
  for (let i = 0; i < 5; i += 1) {
    const leaf = mesh(leafGeometry, 0x4a9367);
    leaf.scale.set(1.3, 0.52, 0.75);
    leaf.position.set(-4.65 + Math.cos(i) * 0.18, 0.82 + (i % 2) * 0.08, -2.45 + Math.sin(i) * 0.18);
    scene.add(leaf);
  }

  const board = mesh(new THREE.BoxGeometry(2.2, 1.1, 0.08), 0xffffff);
  board.position.set(3.35, 2.05, -3.0);
  scene.add(board);

  const boardLine = mesh(new THREE.BoxGeometry(1.6, 0.035, 0.02), 0x168458);
  boardLine.position.set(3.35, 2.15, -2.94);
  scene.add(boardLine);
}

function mesh(geometry, color, emissive = false) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.04,
    emissive: emissive ? color : 0x000000,
    emissiveIntensity: emissive ? 0.32 : 0,
  });
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}
