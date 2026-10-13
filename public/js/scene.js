import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const container = document.querySelector("#barber-scene");

if (container) {
  const fallback = container.querySelector(".scene-fallback");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);
  if (fallback) fallback.style.display = "none";

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));

  const keyLight = new THREE.DirectionalLight(0xf3f0d9, 3.2);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  const limeLight = new THREE.PointLight(0xd6ff63, 22, 10);
  limeLight.position.set(-3, -1, 2);
  scene.add(limeLight);

  const redLight = new THREE.PointLight(0xb84a43, 12, 8);
  redLight.position.set(2, 1, -2);
  scene.add(redLight);

  const group = new THREE.Group();
  scene.add(group);

  // A stylised barber pole built from real 3D geometry.
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7d6ca, metalness: 0.78, roughness: 0.22
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 2.8, 64, 1, false), poleMaterial);
  group.add(pole);

  const stripeCanvas = document.createElement("canvas");
  stripeCanvas.width = 512;
  stripeCanvas.height = 512;
  const ctx = stripeCanvas.getContext("2d");
  ctx.fillStyle = "#e8e5d9";
  ctx.fillRect(0, 0, 512, 512);
  for (let x = -512; x < 1024; x += 128) {
    ctx.fillStyle = "#bc4944";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 62, 0);
    ctx.lineTo(x + 512 + 62, 512);
    ctx.lineTo(x + 512, 512);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#4d6b92";
    ctx.beginPath();
    ctx.moveTo(x + 62, 0);
    ctx.lineTo(x + 96, 0);
    ctx.lineTo(x + 512 + 96, 512);
    ctx.lineTo(x + 512 + 62, 512);
    ctx.closePath();
    ctx.fill();
  }
  const stripeTexture = new THREE.CanvasTexture(stripeCanvas);
  stripeTexture.colorSpace = THREE.SRGBColorSpace;
  stripeTexture.wrapS = THREE.RepeatWrapping;
  stripeTexture.wrapT = THREE.RepeatWrapping;
  stripeTexture.repeat.set(1.2, 1);
  const stripedSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.553, 0.553, 2.45, 64, 1, true),
    new THREE.MeshStandardMaterial({ map: stripeTexture, metalness: 0.12, roughness: 0.35, side: THREE.DoubleSide })
  );
  group.add(stripedSleeve);

  const capMaterial = new THREE.MeshStandardMaterial({ color: 0xf0eee3, metalness: 0.9, roughness: 0.17 });
  for (const y of [-1.43, 1.43]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.18, 64), capMaterial);
    cap.position.y = y;
    group.add(cap);
  }

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.43, 0.57, 0.38, 64),
    new THREE.MeshStandardMaterial({ color: 0x34352e, metalness: 0.95, roughness: 0.2 })
  );
  base.position.y = -1.67;
  group.add(base);

  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xd6ff63, metalness: 0.78, roughness: 0.19 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.018, 12, 100), ringMaterial);
  ring1.rotation.x = 1.1;
  ring1.rotation.y = 0.25;
  group.add(ring1);

  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.009, 8, 100), new THREE.MeshStandardMaterial({ color: 0xaaa99c, metalness: 0.9, roughness: 0.2 }));
  ring2.rotation.x = 0.8;
  ring2.rotation.y = -0.4;
  group.add(ring2);

  // Tiny floating particles add depth without overwhelming the hero.
  const particlePositions = [];
  for (let i = 0; i < 110; i++) {
    particlePositions.push((Math.random() - 0.5) * 4.8, (Math.random() - 0.5) * 4.8, (Math.random() - 0.5) * 2);
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(particlePositions, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({ color: 0xd6ff63, size: 0.018, transparent: true, opacity: 0.7 })
  );
  scene.add(particles);

  let targetX = 0;
  let targetY = 0;
  let frame = 0;

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener("resize", resize);

  container.addEventListener("pointermove", (event) => {
    const rect = container.getBoundingClientRect();
    targetY = ((event.clientX - rect.left) / rect.width - 0.5) * 0.55;
    targetX = ((event.clientY - rect.top) / rect.height - 0.5) * 0.25;
  });
  container.addEventListener("pointerleave", () => { targetX = 0; targetY = 0; });

  function animate() {
    frame += 0.01;
    group.rotation.y += (targetY - group.rotation.y) * 0.035;
    group.rotation.x += (targetX - group.rotation.x) * 0.035;
    group.position.y = Math.sin(frame * 1.2) * 0.08;
    stripedSleeve.rotation.y = frame * 0.12;
    ring1.rotation.z += 0.002;
    ring2.rotation.z -= 0.0014;
    particles.rotation.y = frame * 0.025;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}
