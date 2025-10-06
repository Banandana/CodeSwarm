# GameBoy & GameBoy Advance WebGL Emulator

## Project Overview
Create a web-based GameBoy (GB) and GameBoy Advance (GBA) emulator using HTML5, WebGL, and Node.js. The emulator should run entirely in the browser with a Node.js server hosting the web application.

## Technical Stack
- **Frontend**: HTML5, WebGL, JavaScript (ES6+)
- **Backend**: Node.js with Express
- **Storage**: Browser LocalStorage API
- **Graphics**: WebGL for rendering
- **Audio**: Web Audio API

## Core Features

### 1. Emulator Core
- **CPU Emulation**:
  - GameBoy: Sharp LR35902 (8-bit, Z80-like)
  - GameBoy Advance: ARM7TDMI (32-bit)
- **Memory Management**:
  - ROM loading and mapping
  - RAM management
  - Memory-mapped I/O
- **Graphics Processing Unit (GPU)**:
  - Tile-based rendering for GB
  - Bitmap and tile modes for GBA
  - WebGL-based screen rendering
  - Support for sprite system
  - Background layers
- **Audio Processing Unit (APU)**:
  - 4-channel sound for GB (2 square waves, 1 wave, 1 noise)
  - Direct Sound for GBA (2 DMA channels)
  - Web Audio API integration
- **Input System**:
  - Keyboard mapping (Arrow keys, Z/X for A/B, Enter for Start, Shift for Select)
  - Gamepad API support
  - Touch controls for mobile

### 2. ROM Management
- **ROM Loading**:
  - File upload interface (drag-and-drop)
  - Support for .gb, .gbc, .gba file formats
  - ROM validation and header parsing
  - Display ROM information (title, size, type)
- **ROM Library**:
  - List of loaded ROMs stored in LocalStorage
  - Quick load from library
  - Remove ROMs from library

### 3. Save State System
- **Save States**:
  - Create save states (full emulator state snapshot)
  - Multiple save slots (at least 5 slots per game)
  - Save state metadata (timestamp, screenshot thumbnail)
  - Store in browser LocalStorage
  - Auto-save on close (optional)
- **Load States**:
  - Quick load from any slot
  - Preview save state before loading
  - Delete save states
- **Battery Saves**:
  - Emulate cartridge battery-backed RAM
  - Persist game saves in LocalStorage
  - Auto-save battery RAM periodically

### 4. Emulator Controls
- **Playback Controls**:
  - Start/Resume emulation
  - Pause emulation
  - Stop emulation (reset)
  - Restart/Reset ROM
  - Fast-forward (2x, 4x speed)
  - Frame advance (step mode)
- **State Management Controls**:
  - Quick save (F5)
  - Quick load (F8)
  - Save state menu
  - Load state menu

### 5. Display Features
- **Screen Rendering**:
  - WebGL canvas for emulator display
  - Native resolution: GB (160x144), GBA (240x160)
  - Scaling options: 1x, 2x, 3x, 4x, Fit-to-window
  - Aspect ratio preservation
  - Fullscreen mode
- **Visual Enhancements**:
  - Optional shader effects (CRT filter, scanlines, LCD grid)
  - Color palette options for original GB (Green, Gray, Custom)
  - Smoothing/filtering options (Nearest neighbor, Bilinear)

### 6. Audio Features
- **Audio Output**:
  - Accurate sound emulation via Web Audio API
  - Volume control (0-100%)
  - Mute toggle
  - Individual channel muting for debugging
- **Audio Settings**:
  - Sample rate configuration
  - Buffer size adjustment for latency

### 7. Configuration & Settings
- **General Settings**:
  - Emulation speed (25%, 50%, 100%, 200%, 400%)
  - Auto-save interval
  - Skip boot logo (fast boot)
- **Video Settings**:
  - Display scale
  - Shader selection
  - Frame skip for performance
  - Show FPS counter
- **Audio Settings**:
  - Volume
  - Mute
  - Channel enables
- **Input Settings**:
  - Keyboard remapping
  - Gamepad configuration
  - Touch control layout (mobile)
- **Storage Settings**:
  - Clear all save states
  - Clear ROM library
  - Export/import saves

### 8. User Interface
- **Main Screen**:
  - Large emulator display (center)
  - Control bar (bottom): Play/Pause, Stop, Reset, Fast-forward
  - Menu bar (top): File, Emulation, Options, Help
- **ROM Selector**:
  - Drag-and-drop zone
  - File browser button
  - ROM library grid view
- **Save State Manager**:
  - Slot-based interface with thumbnails
  - Timestamp display
  - Save/Load buttons
- **Settings Panel**:
  - Tabbed interface (Video, Audio, Input, General)
  - Real-time preview of changes
- **On-Screen Display (OSD)**:
  - Status messages (ROM loaded, State saved, etc.)
  - FPS counter (optional)
  - Current speed indicator

### 9. Developer/Debug Features (Optional)
- **Debugging Tools**:
  - Memory viewer
  - CPU register display
  - Breakpoint support
  - Step-through execution
  - Tile/sprite viewer
  - Background layer viewer

## Technical Requirements

### Frontend Architecture
- **Modular Structure**:
  - `emulator/cpu/` - CPU emulation core
  - `emulator/gpu/` - Graphics processing
  - `emulator/apu/` - Audio processing
  - `emulator/memory/` - Memory management
  - `emulator/input/` - Input handling
  - `ui/` - User interface components
  - `storage/` - LocalStorage management
  - `webgl/` - WebGL rendering engine
- **Performance**:
  - Run at 60 FPS for GB/GBC
  - Run at 60 FPS for GBA (with possible frame skip on slower devices)
  - Efficient rendering using WebGL
  - Web Workers for CPU emulation (offload from main thread)

### Backend (Node.js)
- **Express Server**:
  - Serve static files (HTML, CSS, JS)
  - Single-page application
  - Development mode with hot reload
  - Production build with minification
- **API Endpoints** (if needed):
  - ROM metadata service
  - BIOS file serving (if legal BIOS files available)

### Storage Strategy
- **LocalStorage**:
  - Save states: `emulator_save_${gameId}_${slot}`
  - Battery saves: `emulator_battery_${gameId}`
  - ROM library: `emulator_roms`
  - Settings: `emulator_settings`
  - Key input mappings: `emulator_controls`
- **Storage Limits**:
  - Implement compression for save states
  - Warn user when approaching LocalStorage quota
  - Option to export saves as files

## File Structure
```
gameboy-emulator/
├── server/
│   ├── index.js              # Express server
│   ├── routes/
│   └── config/
├── public/
│   ├── index.html            # Main HTML page
│   ├── css/
│   │   ├── main.css
│   │   └── emulator.css
│   ├── js/
│   │   ├── main.js           # Application entry point
│   │   ├── emulator/
│   │   │   ├── gameboy/
│   │   │   │   ├── cpu.js
│   │   │   │   ├── gpu.js
│   │   │   │   ├── apu.js
│   │   │   │   └── memory.js
│   │   │   ├── gba/
│   │   │   │   ├── cpu.js
│   │   │   │   ├── gpu.js
│   │   │   │   ├── apu.js
│   │   │   │   └── memory.js
│   │   │   └── core.js       # Emulator coordinator
│   │   ├── ui/
│   │   │   ├── controls.js
│   │   │   ├── settings.js
│   │   │   ├── rom-loader.js
│   │   │   └── save-manager.js
│   │   ├── storage/
│   │   │   └── local-storage.js
│   │   ├── webgl/
│   │   │   ├── renderer.js
│   │   │   └── shaders.js
│   │   └── input/
│   │       └── controller.js
│   └── assets/
│       ├── icons/
│       └── shaders/
├── package.json
├── README.md
└── .env
```

## Implementation Priorities

### Phase 1: Foundation (Critical)
1. Express server setup
2. Basic HTML/CSS interface
3. ROM loading system
4. WebGL display setup

### Phase 2: GameBoy Emulation (Critical)
1. GB CPU emulation (LR35902)
2. GB GPU emulation (tile rendering)
3. GB memory management
4. Basic input handling
5. Simple audio (at least 1 channel working)

### Phase 3: Core Features (Critical)
1. Save state system
2. Battery save system
3. LocalStorage integration
4. Playback controls (play/pause/reset)

### Phase 4: Usability (High Priority)
1. Complete audio emulation (all channels)
2. Gamepad support
3. Settings panel
4. ROM library
5. Fast-forward feature

### Phase 5: GameBoy Advance (High Priority)
1. GBA CPU emulation (ARM7TDMI)
2. GBA GPU emulation (bitmap modes)
3. GBA audio (Direct Sound)
4. GBA-specific features

### Phase 6: Polish (Medium Priority)
1. Visual shaders (CRT, scanlines)
2. UI improvements
3. Mobile support
4. Export/import saves
5. Fullscreen mode

## Quality Requirements

### Performance
- Maintain 60 FPS during normal gameplay
- Load ROMs in under 2 seconds
- Save/Load states in under 1 second
- Minimal input lag (< 50ms)

### Compatibility
- Modern browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Desktop and mobile support
- Responsive design for various screen sizes

### Code Quality
- Clean, modular architecture
- Comprehensive inline documentation
- Unit tests for CPU/GPU/APU operations
- Integration tests for emulator core

### User Experience
- Intuitive interface
- Clear feedback for all actions
- Helpful error messages
- Keyboard shortcuts for power users
- Touch-friendly controls for mobile

## Legal & Ethical Considerations
- **No ROMs Included**: Do not bundle any copyrighted ROM files
- **BIOS Files**: Do not include copyrighted BIOS files (users must provide)
- **Disclaimer**: Include clear disclaimer about ROM ownership
- **Educational Purpose**: Emphasize educational/preservation purpose

## Testing Strategy
- **Test ROMs**: Use homebrew ROMs for testing (freely available)
- **Unit Tests**: CPU instructions, memory operations, GPU rendering
- **Integration Tests**: Full emulation cycle, save/load states
- **Performance Tests**: FPS benchmarks, memory usage
- **Browser Compatibility**: Test on multiple browsers
- **User Acceptance Testing**: Real-world usage scenarios

## Documentation Requirements
- **README.md**: Setup, usage, features, controls
- **User Guide**: How to load ROMs, use save states, configure settings
- **Developer Guide**: Architecture, emulation details, contribution guide
- **API Documentation**: If backend APIs are exposed
- **Controls Reference**: Keyboard shortcuts, gamepad mappings

## Success Criteria
1. Successfully emulate GameBoy (GB) games at full speed
2. Successfully emulate GameBoy Advance (GBA) games at acceptable speed
3. Save and load states work reliably
4. Battery saves persist across sessions
5. Audio plays correctly with minimal glitches
6. Controls are responsive and configurable
7. UI is intuitive and responsive
8. Works on modern browsers without plugins

## Budget Constraint
- Maximum budget: $75.00 USD
- Sufficient for complete emulator implementation
- Allows for comprehensive code generation
- All critical features included
- Proper testing and documentation

## Notes for Implementation
- Use existing emulation references (documentation, not code) to ensure accuracy
- Implement cycle-accurate timing for smooth emulation
- Use TypedArrays (Uint8Array, Uint16Array) for performance
- Leverage Web Workers to prevent UI blocking
- Implement efficient WebGL rendering (minimize draw calls)
- Use compressed save states to maximize LocalStorage capacity
- Consider using IndexedDB if LocalStorage is insufficient

## Expected Deliverables
1. Working Node.js/Express server
2. Complete frontend application (HTML/CSS/JS)
3. GameBoy emulator core
4. GameBoy Advance emulator core
5. WebGL rendering engine
6. Save state management system
7. User interface with all controls
8. Configuration system
9. README with setup instructions
10. Basic test suite

## Timeline Estimate
Given the budget constraint, prioritize:
1. Working GB emulator first (simpler architecture)
2. Core features (load ROM, play, save/load state)
3. Basic GBA support
4. Polish and additional features as budget allows
