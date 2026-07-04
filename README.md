# WebXR 3D Model Viewer

A static website for viewing 3D models in immersive VR mode using the WebXR API, optimized for Meta Quest 3.

## Features

- 🥽 Immersive VR mode via WebXR API
- 📦 Support for GLTF/GLB and Gaussian Splat formats (`.splat`, `.ksplat`, `.ply`)
- 🎮 Meta Quest 3 controller support with visual feedback
- 📁 Load models from file selector or drag-and-drop
- 🖱️ OrbitControls for non-VR viewing
- 📱 Responsive UI design

## Quick Start

### Prerequisites

WebXR requires HTTPS or localhost. You'll need a local server:

```bash
# Option 1: Using npx serve
npx serve .

# Option 2: Using Python
python -m http.server 8000

# Option 3: Using PHP
php -S localhost:8000
```

### Running on Meta Quest 3

1. Start the local server on your computer
2. Find your computer's local IP address (e.g., `192.168.1.100`)
3. Open Meta Quest 3 Browser
4. Navigate to `http://<your-ip>:3000` (or your server's port)
5. Click "Enter VR" to start immersive mode

> **Note:** For testing on Quest 3 over local network, you may need to use a service like [ngrok](https://ngrok.com/) to create an HTTPS tunnel.

## Project Structure

```
WebXR/
├── index.html          # Main entry point
├── css/
│   └── style.css       # Styling
├── js/
│   ├── app.js          # Main application logic
│   └── xr-manager.js   # WebXR session management
├── models/             # Place your GLTF/GLB or Gaussian Splat files here
└── README.md
```

## Usage

### Loading Models

1. **Dropdown Selection:** Choose from pre-configured models in the dropdown
2. **File Upload:** Click "Upload Model" to load a local `.glb`, `.gltf`, `.splat`, `.ksplat`, or `.ply` file

### VR Controls (Meta Quest 3)

- **Left Thumbstick:** Move around the scene
- **Right Thumbstick X/Y:** Rotate model and move model up/down
- **Press either thumbstick:** Show/hide tutorial panel
- **A/X button:** Toggle passthrough mode
- **B/Y button:** Exit VR session
- **Pinch Zoom:** Hold grip on both controllers, then move hands apart to zoom in and move hands together to zoom out

### Non-VR Controls

- **Left Mouse + Drag:** Rotate view
- **Right Mouse + Drag:** Pan view
- **Scroll Wheel:** Zoom in/out

## Adding Models

Place your model files in the `models/` directory, then add them to the dropdown in `index.html`:

```html
<select id="model-select">
    <option value="">-- Choose a model --</option>
    <option value="models/your-model.glb">Your Model Name</option>
    <option value="models/your-scene.splat">Your Gaussian Splat</option>
</select>
```

## Browser Compatibility

| Browser | WebXR Support |
|---------|---------------|
| Meta Quest Browser | ✅ Full |
| Chrome (Android) | ✅ Full |
| Chrome (Desktop) | ⚠️ With WebXR emulator |
| Firefox | ⚠️ Limited |
| Safari | ❌ Not supported |

## Development

The project uses vanilla JavaScript with ES6 modules. Three.js is loaded from CDN.

### Key Files

- [app.js](js/app.js) - Scene setup, model loading, render loop
- [xr-manager.js](js/xr-manager.js) - WebXR session and controller handling

## License

MIT
