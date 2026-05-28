/* ═══════════════════════════════════════════════════════
   WHITE LANE — 3D FLEET VIEWER ARCHITECTURE
   Three.js luxury studio environment
   Current state: PNG transparent cutout assets
   Upgrade path: drop GLB files into /assets/fleet/3d/ → viewer auto-loads
═══════════════════════════════════════════════════════ */

// ── Fleet vehicle data ──────────────────────────────────────────
// To activate 3D: add a real .glb file at the model path.
// The viewer checks modelStatus — "ready" triggers GLB load, "pending" uses PNG plane.

const FLEET_VEHICLES = [
    {
        id:          "range-rover-gold",
        name:        "Range Rover",
        class:       "Signature Class",
        sub:         "Gold Edition · White Lane Exclusive",
        image:       "assets/fleet/transparent/range-rover-gold.png",
        model:       "assets/fleet/3d/range-rover-gold.glb",
        modelStatus: "pending",   // change to "ready" when GLB is placed
        specs: { capacity: "4 Guests", type: "Executive SUV", accent: "Gold" },
        bookingUrl:  "#app"
    },
    {
        id:          "escalade-white",
        name:        "Cadillac Escalade",
        class:       "Executive Class",
        sub:         "Executive Fleet · White Lane Standard",
        image:       "assets/fleet/transparent/escalade-white.png",
        model:       "assets/fleet/3d/escalade-white.glb",
        modelStatus: "pending",
        specs: { capacity: "6 Guests", type: "Executive SUV", variant: "ESV Platinum" },
        bookingUrl:  "#app"
    },
    {
        id:          "mercedes-gls-white",
        name:        "Mercedes GLS",
        class:       "Premium Class",
        sub:         "Premium Fleet · 7-Seat Luxury",
        image:       "assets/fleet/transparent/mercedes-gls-white.png",
        model:       "assets/fleet/3d/mercedes-gls-white.glb",
        modelStatus: "pending",
        specs: { capacity: "7 Guests", type: "Full-Size SUV", variant: "GLS 580" },
        bookingUrl:  "#app"
    },
    {
        id:          "mercedes-s-white",
        name:        "Mercedes S‑Class",
        class:       "Executive Sedan",
        sub:         "Sedan Class · Refined Arrival",
        image:       "assets/fleet/transparent/mercedes-s-white.png",
        model:       "assets/fleet/3d/mercedes-s-white.glb",
        modelStatus: "pending",
        specs: { capacity: "3 Guests", type: "Executive Sedan", variant: "S 580 LWB" },
        bookingUrl:  "#app"
    }
];

// ── FleetViewer3D class ─────────────────────────────────────────
// Requires Three.js r167+ loaded before this script
// Usage: const viewer = new FleetViewer3D('canvas-id'); viewer.loadVehicle(0);

class FleetViewer3D {

    constructor(canvasId) {
        if (typeof THREE === 'undefined') {
            console.warn('[FleetViewer3D] Three.js not loaded. Run from a server with Three.js available.');
            return;
        }

        this.canvas   = document.getElementById(canvasId);
        this.vehicles = FLEET_VEHICLES;
        this.current  = null;
        this._mesh    = null;

        this._initScene();
        this._initLights();
        this._initFloor();
        this._initControls();
        this._animate();

        window.addEventListener('resize', () => this._resize());
    }

    // ── Scene setup ─────────────────────────────────────────────

    _initScene() {
        const W = this.canvas.clientWidth;
        const H = this.canvas.clientHeight;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(W, H);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x030303);

        this.camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
        this.camera.position.set(0, 1.2, 5.5);
        this.camera.lookAt(0, 0.5, 0);
    }

    // ── Luxury studio lighting ───────────────────────────────────

    _initLights() {
        // Ambient — low fill
        const ambient = new THREE.AmbientLight(0xfff8f0, 0.25);
        this.scene.add(ambient);

        // Key light — warm, above left
        const key = new THREE.DirectionalLight(0xfff5e0, 2.8);
        key.position.set(-3, 5, 3);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.near = 0.1;
        key.shadow.camera.far  = 20;
        key.shadow.camera.left = key.shadow.camera.bottom = -4;
        key.shadow.camera.right = key.shadow.camera.top = 4;
        this.scene.add(key);

        // Rim light — cool, behind right
        const rim = new THREE.DirectionalLight(0xe8f0ff, 1.0);
        rim.position.set(4, 3, -3);
        this.scene.add(rim);

        // Gold accent spot — low, from front, simulates gold glow
        const spot = new THREE.PointLight(0xc9a84c, 0.4, 8);
        spot.position.set(0, 0.2, 3.5);
        this.scene.add(spot);

        // Floor fill — bounced from below
        const fill = new THREE.HemisphereLight(0x101010, 0x000000, 0.4);
        this.scene.add(fill);
    }

    // ── Reflective floor plane ───────────────────────────────────

    _initFloor() {
        const geo = new THREE.PlaneGeometry(14, 14);
        const mat = new THREE.MeshStandardMaterial({
            color:     0x050505,
            metalness: 0.85,
            roughness: 0.22,
        });
        const floor = new THREE.Mesh(geo, mat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.01;
        floor.receiveShadow = true;
        this.scene.add(floor);
        this._floor = floor;
    }

    // ── Orbit controls (manual — no dep) ────────────────────────

    _initControls() {
        // Simple auto-rotate — no OrbitControls dependency required
        this._autoRotate = true;
        this._rotY = 0;
    }

    // ── Load vehicle ─────────────────────────────────────────────

    loadVehicle(indexOrId) {
        const v = typeof indexOrId === 'number'
            ? this.vehicles[indexOrId]
            : this.vehicles.find(x => x.id === indexOrId);

        if (!v) return;
        this.current = v;

        // Remove existing mesh
        if (this._mesh) {
            this.scene.remove(this._mesh);
            this._mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); });
            this._mesh = null;
        }

        if (v.modelStatus === 'ready') {
            this._loadGLB(v.model);
        } else {
            this._loadPNGPlane(v.image);
        }
    }

    // ── GLB loader ───────────────────────────────────────────────

    _loadGLB(path) {
        if (typeof GLTFLoader === 'undefined') {
            console.warn('[FleetViewer3D] GLTFLoader not available.');
            return;
        }
        const loader = new GLTFLoader();
        loader.load(path, (gltf) => {
            const model = gltf.scene;

            // Auto-scale to fit viewport
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const scale = 3.2 / Math.max(size.x, size.y, size.z);
            model.scale.setScalar(scale);

            // Center on floor
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center.multiplyScalar(scale));
            model.position.y = 0;

            model.traverse(c => { if (c.isMesh) c.castShadow = true; });

            this.scene.add(model);
            this._mesh = model;
        });
    }

    // ── PNG plane fallback ───────────────────────────────────────

    _loadPNGPlane(imagePath) {
        const loader  = new THREE.TextureLoader();
        loader.load(imagePath, (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;

            const aspect = tex.image.width / tex.image.height;
            const planeW = 4.2;
            const planeH = planeW / aspect;

            const geo = new THREE.PlaneGeometry(planeW, planeH);
            const mat = new THREE.MeshBasicMaterial({
                map:         tex,
                transparent: true,
                alphaTest:   0.05,
                side:        THREE.FrontSide,
            });
            const plane = new THREE.Mesh(geo, mat);
            plane.position.set(0, planeH / 2 - 0.05, 0);
            plane.castShadow = false;

            this.scene.add(plane);
            this._mesh = plane;
        });
    }

    // ── Resize ───────────────────────────────────────────────────

    _resize() {
        const W = this.canvas.clientWidth;
        const H = this.canvas.clientHeight;
        this.camera.aspect = W / H;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(W, H);
    }

    // ── Animation loop ───────────────────────────────────────────

    _animate() {
        requestAnimationFrame(() => this._animate());

        if (this._autoRotate && this._mesh) {
            this._rotY += 0.003;
            this._mesh.rotation.y = this._rotY;
        }

        this.renderer.render(this.scene, this.camera);
    }

    // ── Public API ───────────────────────────────────────────────

    pauseRotation()  { this._autoRotate = false; }
    resumeRotation() { this._autoRotate = true;  }

    setVehicle(idx) { this.loadVehicle(idx); }
}

// ── Standalone initialization ────────────────────────────────────
// Called when this file is used as the main fleet viewer (prototype mode)
// In production, FleetViewer3D is instantiated by the main site JS.

if (typeof window !== 'undefined' && document.getElementById('fleet-3d-canvas')) {
    window.addEventListener('DOMContentLoaded', () => {
        const viewer = new FleetViewer3D('fleet-3d-canvas');
        viewer.loadVehicle(0);
        window._fleetViewer = viewer;

        // Wire nav if present
        document.querySelectorAll('[data-3d-vehicle]').forEach(btn => {
            btn.addEventListener('click', () => viewer.setVehicle(parseInt(btn.dataset['3dVehicle'])));
        });
    });
}
