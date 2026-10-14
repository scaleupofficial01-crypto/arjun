"use client";

import { useEffect, useRef } from "react";

/**
 * Empire 3D scene — "10 levels to Freedom": a rising spiral of ten golden
 * steps with drifting gold dust and a soft crown glow. Vanilla three.js,
 * loaded lazily (client-only), transparent over the app background.
 */
export default function EmpireScene({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      const width = host.clientWidth || 600;
      const height = host.clientHeight || 180;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      camera.position.set(0, 1.4, 9);

      const gold = new THREE.Color("#f59e0b");
      const group = new THREE.Group();
      scene.add(group);

      // Ten golden steps spiraling upward — the 10 levels.
      const stepGeo = new THREE.BoxGeometry(0.9, 0.22, 0.9);
      const steps: { m: InstanceType<typeof THREE.Mesh>; base: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const t = i / 10;
        const mat = new THREE.MeshStandardMaterial({
          color: gold,
          emissive: gold,
          emissiveIntensity: 0.15 + t * 0.5,
          metalness: 0.75,
          roughness: 0.25,
        });
        const mesh = new THREE.Mesh(stepGeo, mat);
        const ang = t * Math.PI * 2 * 0.85 - 1.2;
        const rad = 2.6 - t * 1.1;
        mesh.position.set(Math.cos(ang) * rad, (t - 0.5) * 2.4, Math.sin(ang) * rad);
        mesh.rotation.y = -ang;
        group.add(mesh);
        steps.push({ m: mesh, base: mesh.position.y });
      }

      // Gold-dust particles rising with the staircase.
      const pCount = 240;
      const pPos = new Float32Array(pCount * 3);
      const pSeed: number[] = [];
      for (let i = 0; i < pCount; i++) {
        const t = Math.random();
        const ang = Math.random() * Math.PI * 2;
        const rad = 1 + Math.random() * 2.6;
        pPos[i * 3] = Math.cos(ang) * rad;
        pPos[i * 3 + 1] = (t - 0.5) * 3;
        pPos[i * 3 + 2] = Math.sin(ang) * rad;
        pSeed.push(Math.random() * Math.PI * 2);
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({
        color: gold,
        size: 0.035,
        transparent: true,
        opacity: 0.75,
        sizeAttenuation: true,
      });
      const dust = new THREE.Points(pGeo, pMat);
      group.add(dust);

      // Crown ring at the top.
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.03, 16, 64),
        new THREE.MeshStandardMaterial({
          color: gold,
          emissive: gold,
          emissiveIntensity: 1.1,
          metalness: 0.9,
          roughness: 0.15,
        }),
      );
      ring.position.y = 1.5;
      ring.rotation.x = Math.PI / 2.4;
      group.add(ring);

      scene.add(new THREE.AmbientLight(0x334155, 1.4));
      const key = new THREE.PointLight(0xf59e0b, 24, 40);
      key.position.set(3, 4, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x64748b, 1.1);
      rim.position.set(-4, 2, -3);
      scene.add(rim);

      // Pointer parallax.
      let tx = 0, ty = 0;
      const onMove = (e: PointerEvent) => {
        const r = host.getBoundingClientRect();
        tx = ((e.clientX - r.left) / Math.max(r.width, 1) - 0.5) * 2;
        ty = ((e.clientY - r.top) / Math.max(r.height, 1) - 0.5) * 2;
      };
      host.addEventListener("pointermove", onMove);

      const onResize = () => {
        const w = host.clientWidth || 600;
        const h = host.clientHeight || 180;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(host);

      const clock = new THREE.Clock();
      let raf = 0;
      const animate = () => {
        raf = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        group.rotation.y = t * 0.22;
        group.position.y = Math.sin(t * 0.8) * 0.05;
        camera.position.x += (tx * 0.8 - camera.position.x) * 0.05;
        camera.position.y += (1.4 - ty * 0.5 - camera.position.y) * 0.05;
        camera.lookAt(0, 0.2, 0);
        for (const s of steps) s.m.position.y = s.base + Math.sin(t * 1.4 + s.base * 3) * 0.03;
        ring.rotation.z = t * 0.8;
        const pos = pGeo.getAttribute("position") as unknown as {
          array: Float32Array;
          needsUpdate: boolean;
        };
        for (let i = 0; i < pCount; i++) {
          pos.array[i * 3 + 1] += 0.0022 + Math.sin(t + pSeed[i]) * 0.0007;
          if (pos.array[i * 3 + 1] > 1.6) pos.array[i * 3 + 1] = -1.6;
        }
        pos.needsUpdate = true;
        renderer.render(scene, camera);
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        host.removeEventListener("pointermove", onMove);
        stepGeo.dispose();
        pGeo.dispose();
        pMat.dispose();
        ring.geometry.dispose();
        (ring.material as InstanceType<typeof THREE.Material>).dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div ref={hostRef} className={className} aria-hidden="true" />;
}
