import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class XRManager {
    constructor(renderer, scene, camera, app) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.app = app;
        this.session = null;
        this.controllers = [];
        this.controllerGrips = [];
        this.controllerModelFactory = new XRControllerModelFactory();
        
        // Locomotion
        this.cameraRig = new THREE.Group();
        this.cameraRig.add(camera);
        this.scene.add(this.cameraRig);
        
        this.moveSpeed = 0.05;
        this.verticalSpeed = 0.03;
        
        // Rotation settings - smooth rotation
        this.rotateSpeed = 0.035;
        
        // Passthrough state
        this.passthroughEnabled = false;
        this.originalBackground = null;
        
        this.setupControllers();
    }

    setupControllers() {
        // Controller 0 (usually right hand on Quest 3)
        const controller0 = this.renderer.xr.getController(0);
        controller0.addEventListener('selectstart', () => this.onSelectStart(0));
        controller0.addEventListener('selectend', () => this.onSelectEnd(0));
        controller0.addEventListener('squeezestart', () => this.onSqueezeStart(0));
        controller0.addEventListener('squeezeend', () => this.onSqueezeEnd(0));
        controller0.addEventListener('connected', (e) => this.onControllerConnected(0, e));
        this.scene.add(controller0);
        this.controllers.push(controller0);

        // Controller 1 (usually left hand on Quest 3)
        const controller1 = this.renderer.xr.getController(1);
        controller1.addEventListener('selectstart', () => this.onSelectStart(1));
        controller1.addEventListener('selectend', () => this.onSelectEnd(1));
        controller1.addEventListener('squeezestart', () => this.onSqueezeStart(1));
        controller1.addEventListener('squeezeend', () => this.onSqueezeEnd(1));
        controller1.addEventListener('connected', (e) => this.onControllerConnected(1, e));
        this.scene.add(controller1);
        this.controllers.push(controller1);

        // Controller grips (visual models)
        const controllerGrip0 = this.renderer.xr.getControllerGrip(0);
        controllerGrip0.add(this.controllerModelFactory.createControllerModel(controllerGrip0));
        this.scene.add(controllerGrip0);
        this.controllerGrips.push(controllerGrip0);

        const controllerGrip1 = this.renderer.xr.getControllerGrip(1);
        controllerGrip1.add(this.controllerModelFactory.createControllerModel(controllerGrip1));
        this.scene.add(controllerGrip1);
        this.controllerGrips.push(controllerGrip1);

        // Add ray pointers to controllers
        this.addControllerRay(controller0);
        this.addControllerRay(controller1);
    }

    addControllerRay(controller) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -5)
        ]);
        const material = new THREE.LineBasicMaterial({
            color: 0x667eea,
            linewidth: 2
        });
        const ray = new THREE.Line(geometry, material);
        ray.name = 'ray';
        ray.scale.z = 1;
        controller.add(ray);
    }

    async startSession(usePassthrough = false) {
        if (!navigator.xr) {
            throw new Error('WebXR not available');
        }

        // Store original background for toggling
        this.originalBackground = this.scene.background;
        this.passthroughEnabled = usePassthrough;

        // Check if AR (passthrough) is supported
        const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
        
        let sessionMode = 'immersive-vr';
        let sessionInit = {
            optionalFeatures: [
                'local-floor',
                'bounded-floor',
                'hand-tracking',
                'layers'
            ],
            requiredFeatures: ['local-floor']
        };

        // Use immersive-ar for passthrough on Quest 3
        if (usePassthrough && arSupported) {
            sessionMode = 'immersive-ar';
            this.scene.background = null;
        }

        try {
            this.session = await navigator.xr.requestSession(sessionMode, sessionInit);
            this.currentSessionMode = sessionMode;
            await this.renderer.xr.setSession(this.session);
            
            this.session.addEventListener('end', () => this.onSessionEnd());
            
            console.log(`${sessionMode} session started`);
        } catch (error) {
            console.error('Failed to start XR session:', error);
            throw error;
        }
    }

    async endSession() {
        if (this.session) {
            await this.session.end();
        }
    }

    onSessionEnd() {
        this.session = null;
        // Restore original background
        if (this.originalBackground) {
            this.scene.background = this.originalBackground;
        }
        // Notify app to update UI
        if (this.app && this.app.onXRSessionEnd) {
            this.app.onXRSessionEnd();
        }
        console.log('VR session ended');
    }

    isInSession() {
        return this.session !== null;
    }

    onSelectStart(controllerIndex) {
        console.log(`Controller ${controllerIndex}: select start (trigger pressed)`);
        const controller = this.controllers[controllerIndex];
        const ray = controller.getObjectByName('ray');
        if (ray) {
            ray.material.color.setHex(0x38ef7d);
        }
    }

    onSelectEnd(controllerIndex) {
        console.log(`Controller ${controllerIndex}: select end (trigger released)`);
        const controller = this.controllers[controllerIndex];
        const ray = controller.getObjectByName('ray');
        if (ray) {
            ray.material.color.setHex(0x667eea);
        }
    }

    onSqueezeStart(controllerIndex) {
        console.log(`Controller ${controllerIndex}: squeeze start (grip pressed)`);
    }

    onSqueezeEnd(controllerIndex) {
        console.log(`Controller ${controllerIndex}: squeeze end (grip released)`);
    }

    onControllerConnected(controllerIndex, event) {
        console.log(`Controller ${controllerIndex} connected:`, event.data.handedness);
    }

    async togglePassthrough() {
        // Need to restart session in different mode for passthrough
        const newPassthroughState = !this.passthroughEnabled;
        
        console.log(`Switching to ${newPassthroughState ? 'passthrough (AR)' : 'VR'} mode...`);
        
        // End current session and restart with new mode
        if (this.session) {
            await this.session.end();
            // Small delay to ensure session is fully closed
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.startSession(newPassthroughState);
        }
    }

    update(frame) {
        // XR frame update logic
        if (!this.session) return;

        const referenceSpace = this.renderer.xr.getReferenceSpace();
        if (!referenceSpace) return;

        // Handle controller input
        const inputSources = this.renderer.xr.getSession()?.inputSources;
        if (!inputSources) return;
        
        for (let i = 0; i < inputSources.length; i++) {
            const inputSource = inputSources[i];
            
            if (!inputSource?.gamepad) continue;
            
            const gamepad = inputSource.gamepad;
            const isRightHand = inputSource.handedness === 'right';
            const isLeftHand = inputSource.handedness === 'left';
            
            // Thumbstick axes: [2] = X (left/right), [3] = Y (forward/back)
            const thumbstickX = gamepad.axes[2] || 0;
            const thumbstickY = gamepad.axes[3] || 0;
            
            // Dead zone
            const deadZone = 0.15;
            
            // Button indices for Quest 3:
            // 0 = trigger, 1 = squeeze/grip, 2 = unused, 3 = thumbstick press
            // 4 = A/X button, 5 = B/Y button
            
            // B button (right) or Y button (left) = Exit VR
            if (gamepad.buttons[5]?.pressed) {
                if (!this.exitButtonPressed) {
                    this.exitButtonPressed = true;
                    this.endSession();
                    return;
                }
            } else {
                this.exitButtonPressed = false;
            }
            
            // A button (right) or X button (left) = Toggle passthrough
            if (gamepad.buttons[4]?.pressed) {
                if (!this.passthroughButtonPressed) {
                    this.passthroughButtonPressed = true;
                    this.togglePassthrough();
                }
            } else {
                this.passthroughButtonPressed = false;
            }
            
            if (isRightHand) {
                // Right controller: Rotate model (X) and move model vertically (Y)
                const currentModel = this.app?.currentModel;
                
                // Rotate model
                if (Math.abs(thumbstickX) > deadZone && currentModel) {
                    currentModel.rotation.y += thumbstickX * this.rotateSpeed;
                }
                
                // Move model up/down
                if (Math.abs(thumbstickY) > deadZone && currentModel) {
                    currentModel.position.y -= thumbstickY * this.verticalSpeed;
                }
            } else if (isLeftHand) {
                // Left controller: Movement
                if (Math.abs(thumbstickX) > deadZone || Math.abs(thumbstickY) > deadZone) {
                    // Get camera direction
                    const cameraDirection = new THREE.Vector3();
                    this.camera.getWorldDirection(cameraDirection);
                    cameraDirection.y = 0;
                    cameraDirection.normalize();
                    
                    // Get right direction
                    const rightDirection = new THREE.Vector3();
                    rightDirection.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));
                    
                    // Apply movement
                    const moveX = thumbstickX * this.moveSpeed;
                    const moveZ = thumbstickY * this.moveSpeed;
                    
                    this.cameraRig.position.add(rightDirection.multiplyScalar(-moveX));
                    this.cameraRig.position.add(cameraDirection.multiplyScalar(-moveZ));
                }
            }
        }
    }
}
