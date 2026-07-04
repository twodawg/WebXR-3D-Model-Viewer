import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRManager } from './xr-manager.js';
import * as GaussianSplats3D from 'https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.7/build/gaussian-splats-3d.module.js';

class App {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.xrManager = null;
        this.currentModel = null;
        this.currentModelType = null;
        this.sceneCanvas = null;
        this.splatViewerFrame = null;
        this.pendingUploadUrl = null;
        this.lastSplatSourceUrl = null;
        this.lastSplatExtension = '';
        this.handoffKeepUploadUrl = false;
        this.tutorialVisible = false;
        this.tutorialPanel = null;
        this.softPointTexture = null;
        this.loader = new GLTFLoader();
        this.plyLoader = new PLYLoader();
        
        this.init();
    }

    init() {
        this.setupScene();
        this.setupLighting();
        this.setupControls();
        this.setupXR();
        this.setupTutorialUI();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.animate();
        
        this.updateStatus('Ready - Load a GLB/GLTF/SPLAT model or enter VR');
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js', { scope: './' })
                .then((registration) => {
                    console.log('ServiceWorker registered:', registration.scope);
                })
                .catch((error) => {
                    console.log('ServiceWorker registration failed:', error);
                });
        }
    }

    setupScene() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 1.6, 3);

        // Renderer (alpha: true enables passthrough on Quest 3)
        this.sceneCanvas = document.getElementById('scene');
        this.splatViewerFrame = document.getElementById('splat-viewer-frame');
        const canvas = this.sceneCanvas;
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.xr.enabled = true;
        this.setSplatCanvasVisible(false);

        // Floor grid (only visible outside VR)
        this.gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
        this.scene.add(this.gridHelper);

        // Reference cube (placeholder when no model loaded)
        this.addPlaceholderCube();

        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    addPlaceholderCube() {
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const material = new THREE.MeshStandardMaterial({
            color: 0x667eea,
            metalness: 0.3,
            roughness: 0.7
        });
        this.placeholderCube = new THREE.Mesh(geometry, material);
        this.placeholderCube.position.set(0, 1, 0);
        this.scene.add(this.placeholderCube);
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Hemisphere light for better ambient
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        this.scene.add(hemisphereLight);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 1, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.update();
    }

    setupXR() {
        this.xrManager = new XRManager(this.renderer, this.scene, this.camera, this);
        
        // Use the camera rig's camera for rendering
        this.camera = this.xrManager.cameraRig.children[0];
        this.controls.object = this.camera;
        
        const vrButton = document.getElementById('vr-button');
        const arButton = document.getElementById('ar-button');
        
        if ('xr' in navigator) {
            // Check VR support
            navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
                if (supported) {
                    vrButton.textContent = 'Enter VR';
                    vrButton.disabled = false;
                    vrButton.classList.add('ready');
                } else {
                    vrButton.textContent = 'VR Not Supported';
                }
            });
            
            // Check AR/Passthrough support
            navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
                if (supported) {
                    arButton.textContent = 'Enter Passthrough';
                    arButton.disabled = false;
                    arButton.classList.add('ready');
                    this.updateStatus('Ready - VR and Passthrough available');
                } else {
                    arButton.textContent = 'Passthrough Not Supported';
                    this.updateStatus('Ready - VR mode available');
                }
            });
        } else {
            vrButton.textContent = 'WebXR Not Available';
            arButton.textContent = 'WebXR Not Available';
            this.updateStatus('WebXR not available - use a compatible browser');
        }
    }

    setupEventListeners() {
        // VR Button
        const vrButton = document.getElementById('vr-button');
        vrButton.addEventListener('click', () => this.toggleVR(false));
        
        // AR/Passthrough Button
        const arButton = document.getElementById('ar-button');
        arButton.addEventListener('click', () => this.toggleVR(true));

        // Flip model orientation
        const flipButton = document.getElementById('flip-button');
        if (flipButton) {
            flipButton.addEventListener('click', () => this.flipCurrentModel());
        }

        // Model selection
        const modelSelect = document.getElementById('model-select');
        modelSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadModel(e.target.value);
            }
        });

        // File upload
        const modelUpload = document.getElementById('model-upload');
        modelUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadModelFromFile(file);
            }
        });
    }

    setupTutorialUI() {
        this.tutorialPanel = document.getElementById('vr-tutorial');
        this.setTutorialVisible(false);
    }

    setTutorialVisible(visible) {
        if (!this.tutorialPanel) return;
        this.tutorialVisible = visible;
        this.tutorialPanel.classList.toggle('tutorial-visible', visible);
        this.tutorialPanel.classList.toggle('tutorial-hidden', !visible);
    }

    toggleTutorialUI() {
        this.setTutorialVisible(!this.tutorialVisible);
    }

    async toggleVR(usePassthrough = false) {
        if (this.currentModelType === 'supersplat') {
            const xrReady = await this.prepareSuperSplatForXR();
            if (!xrReady) {
                return;
            }
        }

        const vrButton = document.getElementById('vr-button');
        const arButton = document.getElementById('ar-button');
        
        if (this.xrManager.isInSession()) {
            await this.xrManager.endSession();
        } else {
            try {
                await this.xrManager.startSession(usePassthrough);
                // Hide grid in immersive mode
                this.gridHelper.visible = false;
                if (usePassthrough) {
                    arButton.textContent = 'Exit Passthrough';
                    vrButton.textContent = 'Enter VR';
                } else {
                    vrButton.textContent = 'Exit VR';
                    arButton.textContent = 'Enter Passthrough';
                }
                document.body.classList.add('vr-active');
                this.setTutorialVisible(true);
            } catch (error) {
                console.error('Failed to start XR session:', error);
                this.updateStatus('Failed to start: ' + error.message);
            }
        }
    }

    onXRSessionEnd() {
        const vrButton = document.getElementById('vr-button');
        const arButton = document.getElementById('ar-button');
        vrButton.textContent = 'Enter VR';
        arButton.textContent = 'Enter Passthrough';
        document.body.classList.remove('vr-active');
        // Show grid again
        this.gridHelper.visible = true;
        this.setTutorialVisible(false);
        this.updateStatus('Session ended - Ready');
    }

    loadModel(url) {
        const extension = this.getFileExtension(url);

        if (this.isSplatExtension(extension)) {
            this.loadSuperSplatModel(url, false, extension);
            return;
        }

        this.loadGltfModel(url);
    }

    loadModelFromFile(file) {
        this.updateStatus('Loading uploaded model...');
        
        const url = URL.createObjectURL(file);
        const extension = this.getFileExtension(file.name);

        if (this.isSplatExtension(extension)) {
            this.loadSuperSplatModel(url, true, extension);
            return;
        }

        this.loader.load(
            url,
            (gltf) => {
                this.onModelLoaded(gltf, 'gltf');
                URL.revokeObjectURL(url);
            },
            (progress) => {
                if (progress.total > 0) {
                    const percent = (progress.loaded / progress.total * 100).toFixed(0);
                    this.updateStatus(`Loading: ${percent}%`);
                }
            },
            (error) => {
                console.error('Error loading model:', error);
                this.updateStatus('Error loading model');
                URL.revokeObjectURL(url);
            }
        );
    }

    setSplatCanvasVisible(visible) {
        if (!this.sceneCanvas || !this.splatViewerFrame) return;

        this.splatViewerFrame.style.display = visible ? 'block' : 'none';
        this.sceneCanvas.style.display = visible ? 'none' : 'block';
        if (this.controls) {
            this.controls.enabled = !visible;
        }
        if (this.gridHelper && this.renderer) {
            this.gridHelper.visible = !visible && !this.renderer.xr.isPresenting;
        }
    }

    disposeSuperSplatViewer() {
        if (!this.splatViewerFrame) return;
        if (this.splatViewerFrame.src && this.splatViewerFrame.src !== 'about:blank') {
            this.splatViewerFrame.src = 'about:blank';
        }
    }

    async loadSuperSplatModel(url, revokeOnComplete = false, sourceExtension = '') {
        this.updateStatus('Loading with SuperSplat viewer...');

        try {
            this.clearCurrentModel();
            this.setSplatCanvasVisible(true);

            this.lastSplatSourceUrl = url;
            this.lastSplatExtension = sourceExtension || this.getFileExtension(url);

            if (revokeOnComplete) {
                this.pendingUploadUrl = url;
            }

            const absoluteUrl = new URL(url, window.location.href).href;
            const viewerUrl = `./supersplat/index.html?content=${encodeURIComponent(absoluteUrl)}&webgl=1&noui=1`;
            this.splatViewerFrame.src = viewerUrl;

            this.currentModel = { type: 'supersplat-embed' };
            this.currentModelType = 'supersplat';
            if (this.placeholderCube) {
                this.placeholderCube.visible = false;
            }
            this.updateStatus('SuperSplat loaded - visual quality mode active');
        } catch (error) {
            console.error('SuperSplat viewer load failed, falling back:', error);
            this.setSplatCanvasVisible(false);
            await this.loadSplatModel(url, revokeOnComplete, this.getFileExtension(url));
        } finally {
            if (revokeOnComplete && this.currentModelType !== 'supersplat') {
                URL.revokeObjectURL(url);
            }
        }
    }

    async prepareSuperSplatForXR() {
        if (this.currentModelType !== 'supersplat') {
            return true;
        }

        if (!this.lastSplatSourceUrl) {
            this.updateStatus('No splat source available for XR handoff');
            return false;
        }

        this.updateStatus('Preparing splat for XR session...');
        this.handoffKeepUploadUrl = true;

        try {
            await this.loadSplatModel(this.lastSplatSourceUrl, false, this.lastSplatExtension);
            return true;
        } catch (error) {
            console.error('Failed to prepare SuperSplat for XR:', error);
            this.updateStatus('Failed to prepare splat for XR');
            return false;
        } finally {
            this.handoffKeepUploadUrl = false;
        }
    }

    loadGltfModel(url) {
        this.updateStatus('Loading model...');

        this.loader.load(
            url,
            (gltf) => {
                this.onModelLoaded(gltf, 'gltf');
            },
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(0);
                this.updateStatus(`Loading: ${percent}%`);
            },
            (error) => {
                console.error('Error loading model:', error);
                this.updateStatus('Error loading model');
            }
        );
    }

    getSplatSceneFormat(extension) {
        if (extension === 'ply') return GaussianSplats3D.SceneFormat.Ply;
        if (extension === 'splat') return GaussianSplats3D.SceneFormat.Splat;
        if (extension === 'ksplat') return GaussianSplats3D.SceneFormat.KSplat;
        return undefined;
    }

    fitSplatToViewer(dropInViewer) {
        try {
            const splatMesh = dropInViewer?.viewer?.getSplatMesh?.();
            if (!splatMesh || typeof splatMesh.computeBoundingBox !== 'function') {
                return;
            }

            const box = splatMesh.computeBoundingBox(true);
            if (!box || box.isEmpty()) {
                return;
            }

            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            dropInViewer.position.sub(center);

            if (maxDim > 0) {
                const targetSize = 2;
                const scale = targetSize / maxDim;
                dropInViewer.scale.multiplyScalar(scale);
            }

            dropInViewer.position.y = 1;
        } catch (error) {
            console.warn('Splat fit skipped:', error);
        }
    }

    async loadSplatModel(url, revokeOnComplete = false, sourceExtension = '') {
        this.updateStatus('Loading Gaussian Splat...');
        const extension = sourceExtension || this.getFileExtension(url);
        const format = this.getSplatSceneFormat(extension);

        try {
            const splatViewer = new GaussianSplats3D.DropInViewer({
                gpuAcceleratedSort: true,
                sharedMemoryForWorkers: false,
                useBuiltInControls: false
            });

            await splatViewer.addSplatScenes([
                {
                    path: url,
                    format,
                    position: [0, 1, 0],
                    scale: [1, 1, 1],
                    rotation: [0, 0, 0, 1]
                }
            ]);

            this.onModelLoaded(splatViewer, 'splat');
            this.updateStatus('Gaussian Splat loaded - Enter VR to view immersively');
        } catch (error) {
            console.error('Error loading Gaussian Splat:', error);

            // Fallback: many .ply files are standard point/mesh PLY, not Gaussian splat PLY.
            if (extension === 'ply') {
                try {
                    await this.loadPlyModelFallback(url);
                    this.updateStatus('PLY loaded (fallback renderer) - Enter VR to view immersively');
                } catch (fallbackError) {
                    console.error('Error loading PLY fallback:', fallbackError);
                    this.updateStatus('Error loading Gaussian Splat/PLY');
                }
            } else {
                this.updateStatus('Error loading Gaussian Splat');
            }
        } finally {
            if (revokeOnComplete) {
                URL.revokeObjectURL(url);
            }
        }
    }

    async loadPlyModelFallback(url) {
        try {
            const gaussianPoints = await this.loadGaussianPlyPointCloud(url);
            this.onModelLoaded(gaussianPoints, 'ply');
            return;
        } catch (error) {
            console.warn('Gaussian PLY parse fallback failed, trying Three PLYLoader:', error);
        }

        return new Promise((resolve, reject) => {
            this.plyLoader.load(
                url,
                (geometry) => {
                    const hasVertexColors = geometry.hasAttribute('color');
                    const hasNormals = geometry.hasAttribute('normal');
                    const hasFaces = !!geometry.index;

                    if (!hasNormals && hasFaces) {
                        geometry.computeVertexNormals();
                    }

                    let object;
                    if (hasFaces || hasNormals) {
                        const material = new THREE.MeshStandardMaterial({
                            color: hasVertexColors ? 0xffffff : 0xbec6d2,
                            metalness: 0.05,
                            roughness: 0.85,
                            vertexColors: hasVertexColors
                        });
                        object = new THREE.Mesh(geometry, material);
                    } else {
                        if (hasVertexColors) {
                            if (!geometry.hasAttribute('alpha')) {
                                const count = geometry.attributes.position.count;
                                const alpha = new Float32Array(count);
                                alpha.fill(0.7);
                                geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
                            }
                            const material = this.createSplatLikePointMaterial(8.0);
                            object = new THREE.Points(geometry, material);
                        } else {
                            const material = this.createSoftPointMaterial(false, 0.012);
                            object = new THREE.Points(geometry, material);
                        }
                    }

                    this.onModelLoaded(object, 'ply');
                    resolve();
                },
                undefined,
                (loaderError) => reject(loaderError)
            );
        });
    }

    async loadGaussianPlyPointCloud(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch PLY: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        const marker = 'end_header';
        const markerBytes = new TextEncoder().encode(marker);
        let markerIndex = -1;
        for (let i = 0; i <= uint8.length - markerBytes.length; i++) {
            let matched = true;
            for (let j = 0; j < markerBytes.length; j++) {
                if (uint8[i + j] !== markerBytes[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                markerIndex = i;
                break;
            }
        }

        if (markerIndex === -1) {
            throw new Error('PLY header end marker not found');
        }

        let dataOffset = markerIndex + markerBytes.length;
        if (uint8[dataOffset] === 13) dataOffset += 1;
        if (uint8[dataOffset] === 10) dataOffset += 1;

        const headerText = new TextDecoder().decode(uint8.slice(0, markerIndex));
        const headerLines = headerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

        let vertexCount = 0;
        const properties = [];
        for (const line of headerLines) {
            if (line.startsWith('element vertex')) {
                vertexCount = parseInt(line.split(/\s+/)[2], 10) || 0;
            } else if (line.startsWith('property float')) {
                properties.push(line.split(/\s+/)[2]);
            }
        }

        const idxX = properties.indexOf('x');
        const idxY = properties.indexOf('y');
        const idxZ = properties.indexOf('z');
        const idxR = properties.indexOf('f_dc_0');
        const idxG = properties.indexOf('f_dc_1');
        const idxB = properties.indexOf('f_dc_2');
        const idxOpacity = properties.indexOf('opacity');

        if (vertexCount <= 0 || idxX < 0 || idxY < 0 || idxZ < 0 || idxR < 0 || idxG < 0 || idxB < 0) {
            throw new Error('Required Gaussian PLY properties missing');
        }

        const stride = properties.length * 4;
        const expectedBytes = dataOffset + vertexCount * stride;
        if (expectedBytes > arrayBuffer.byteLength) {
            throw new Error('PLY data shorter than expected for header definition');
        }

        const view = new DataView(arrayBuffer);
        const positions = new Float32Array(vertexCount * 3);
        const colors = new Float32Array(vertexCount * 3);
        const alphas = new Float32Array(vertexCount);

        const sigmoid = (x) => 1 / (1 + Math.exp(-x));

        for (let i = 0; i < vertexCount; i++) {
            const base = dataOffset + i * stride;
            positions[i * 3] = view.getFloat32(base + idxX * 4, true);
            positions[i * 3 + 1] = view.getFloat32(base + idxY * 4, true);
            positions[i * 3 + 2] = view.getFloat32(base + idxZ * 4, true);

            const r = view.getFloat32(base + idxR * 4, true);
            const g = view.getFloat32(base + idxG * 4, true);
            const b = view.getFloat32(base + idxB * 4, true);
            const opacity = idxOpacity >= 0 ? sigmoid(view.getFloat32(base + idxOpacity * 4, true)) : 1;
            const brightness = Math.max(opacity, 0.15);
            colors[i * 3] = sigmoid(r) * brightness;
            colors[i * 3 + 1] = sigmoid(g) * brightness;
            colors[i * 3 + 2] = sigmoid(b) * brightness;
            alphas[i] = Math.max(opacity, 0.08);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        const material = this.createSplatLikePointMaterial(8.0);

        return new THREE.Points(geometry, material);
    }

    createSplatLikePointMaterial(pointSizePx = 20.0) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uPointSize: { value: pointSizePx }
            },
            vertexShader: `
                uniform float uPointSize;
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;

                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float depth = max(0.1, -mvPosition.z);
                    gl_PointSize = clamp(uPointSize * (1.0 / depth), 1.0, 4.0);
                    gl_Position = projectionMatrix * mvPosition;
                    vColor = color;
                    vAlpha = alpha;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;

                void main() {
                    vec2 p = gl_PointCoord * 2.0 - 1.0;
                    float r2 = dot(p, p);
                    if (r2 > 1.0) discard;

                    float falloff = exp(-6.0 * r2);
                    float alpha = min(1.0, vAlpha * 0.7 * falloff);
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
    }

    createSoftPointTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        const center = size / 2;
        const radius = size / 2;
        const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.85)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    createSoftPointMaterial(vertexColors = true, size = 0.01) {
        if (!this.softPointTexture) {
            this.softPointTexture = this.createSoftPointTexture();
        }

        return new THREE.PointsMaterial({
            color: vertexColors ? 0xffffff : 0xbec6d2,
            size,
            sizeAttenuation: true,
            vertexColors,
            map: this.softPointTexture,
            transparent: true,
            alphaTest: 0.05,
            depthWrite: false,
            blending: THREE.NormalBlending
        });
    }

    fitObjectToViewer(object) {
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        object.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const targetSize = 2;
            const scale = targetSize / maxDim;
            object.scale.multiplyScalar(scale);
        }

        object.position.y = 1;
    }

    flipCurrentModel() {
        if (!this.currentModel) {
            this.updateStatus('No model loaded to flip');
            return;
        }

        if (this.currentModelType === 'supersplat') {
            this.updateStatus('Flip is not available in SuperSplat viewer mode');
            return;
        }

        this.currentModel.rotateX(Math.PI);
        this.currentModel.rotateY(Math.PI);
        this.updateStatus('Model flipped 180deg on X and Y');
    }

    clearCurrentModel() {
        if (!this.currentModel && this.currentModelType !== 'supersplat') return;

        if (this.pendingUploadUrl && !this.handoffKeepUploadUrl) {
            URL.revokeObjectURL(this.pendingUploadUrl);
            this.pendingUploadUrl = null;
        }

        if (this.currentModelType === 'supersplat') {
            this.disposeSuperSplatViewer();
            this.setSplatCanvasVisible(false);
        }

        if (!this.currentModel) {
            this.currentModelType = null;
            return;
        }

        this.scene.remove(this.currentModel);

        if (this.currentModelType === 'splat' && typeof this.currentModel.dispose === 'function') {
            this.currentModel.dispose();
        }

        this.currentModel = null;
        this.currentModelType = null;
    }

    getFileExtension(path) {
        if (!path) return '';
        const cleanPath = path.split('?')[0].split('#')[0];
        const dotIndex = cleanPath.lastIndexOf('.');
        if (dotIndex === -1) return '';
        return cleanPath.slice(dotIndex + 1).toLowerCase();
    }

    isSplatExtension(extension) {
        return extension === 'splat' || extension === 'ksplat' || extension === 'ply';
    }

    onModelLoaded(model, modelType = 'gltf') {
        this.clearCurrentModel();

        // Hide placeholder
        if (this.placeholderCube) {
            this.placeholderCube.visible = false;
        }

        // Add new model
        this.currentModel = modelType === 'gltf' ? model.scene : model;
        this.currentModelType = modelType;

        if (modelType === 'splat') {
            this.fitSplatToViewer(this.currentModel);
            this.currentModel.rotateX(Math.PI);
            this.currentModel.rotateY(Math.PI);
        }

        if (modelType === 'gltf' || modelType === 'ply') {
            this.fitObjectToViewer(this.currentModel);
        }

        if (modelType === 'ply') {
            this.currentModel.rotateX(Math.PI);
            this.currentModel.rotateY(Math.PI);
        }

        this.scene.add(this.currentModel);
        if (modelType === 'gltf') {
            this.updateStatus('Model loaded - Enter VR to view immersively');
        }
    }

    updateStatus(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        this.renderer.setAnimationLoop((time, frame) => {
            // Update controls when not in XR
            if (!this.renderer.xr.isPresenting) {
                this.controls.update();
                
                // Rotate placeholder cube
                if (this.placeholderCube && this.placeholderCube.visible) {
                    this.placeholderCube.rotation.y += 0.01;
                }
            }

            // Handle XR frame updates
            if (frame && this.xrManager) {
                this.xrManager.update(frame);
            }

            this.renderer.render(this.scene, this.camera);
        });
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    if (typeof window !== 'undefined') {
        window.__app = app;
    }
});
