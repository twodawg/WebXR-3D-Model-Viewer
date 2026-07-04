import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRManager } from './xr-manager.js';

class App {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.xrManager = null;
        this.currentModel = null;
        this.loader = new GLTFLoader();
        
        this.init();
    }

    init() {
        this.setupScene();
        this.setupLighting();
        this.setupControls();
        this.setupXR();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.animate();
        
        this.updateStatus('Ready - Select a model or enter VR');
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
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
        const canvas = document.getElementById('scene');
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.xr.enabled = true;

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

    async toggleVR(usePassthrough = false) {
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
        this.updateStatus('Session ended - Ready');
    }

    loadModel(url) {
        this.updateStatus('Loading model...');
        
        this.loader.load(
            url,
            (gltf) => {
                this.onModelLoaded(gltf);
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

    loadModelFromFile(file) {
        this.updateStatus('Loading uploaded model...');
        
        const url = URL.createObjectURL(file);
        this.loader.load(
            url,
            (gltf) => {
                this.onModelLoaded(gltf);
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

    onModelLoaded(gltf) {
        // Remove previous model
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
        }

        // Hide placeholder
        if (this.placeholderCube) {
            this.placeholderCube.visible = false;
        }

        // Add new model
        this.currentModel = gltf.scene;

        // Center and scale model
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Reset position to center
        this.currentModel.position.sub(center);
        
        // Scale to reasonable size (max 2 units)
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 2) {
            const scale = 2 / maxDim;
            this.currentModel.scale.multiplyScalar(scale);
        }

        // Position at eye level
        this.currentModel.position.y = 1;

        this.scene.add(this.currentModel);
        this.updateStatus('Model loaded - Enter VR to view immersively');
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
    new App();
});
