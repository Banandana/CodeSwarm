# GameBoy Emulator - MVP

## Project Overview
Create a minimal web-based GameBoy (original GB only) emulator that can load and play ROM files in the browser.

## Technical Stack
- **Frontend**: HTML5, Canvas 2D, JavaScript (ES6+)
- **Backend**: Node.js with Express (serve static files only)
- **Storage**: Browser LocalStorage for save states
- **Graphics**: Canvas 2D for display
- **Audio**: Web Audio API

## Core Features (MVP Only)

### 1. ROM Loading
- File upload button for .gb files
- ROM validation (check header)
- Display ROM title from header

### 2. CPU Emulation
- Sharp LR35902 (8-bit Z80-like) instruction set
- All opcodes implemented
- Cycle-accurate timing

### 3. Graphics (PPU)
- 160x144 display resolution
- Tile-based rendering
- Background layer only (no sprites for MVP)
- Display on HTML5 Canvas

### 4. Memory Management
- ROM banking (support MBC1)
- Work RAM
- Video RAM
- I/O registers

### 5. Input System
- Keyboard controls only:
  - Arrow keys for D-pad
  - Z = A button
  - X = B button
  - Enter = Start
  - Shift = Select

### 6. Basic Audio
- Square wave channel 1 only
- Volume control
- Mute button

### 7. Emulator Controls
- Start/Pause button
- Reset button
- Speed indicator (FPS counter)

### 8. Web Server
- Express server to serve static files
- Single HTML page
- No API endpoints needed

## What's NOT Included (Post-MVP)
- ❌ GameBoy Color support
- ❌ GameBoy Advance
- ❌ Sprites
- ❌ Multiple audio channels
- ❌ Save states
- ❌ Battery saves
- ❌ ROM library
- ❌ Gamepad support
- ❌ Touch controls
- ❌ Visual filters/shaders
- ❌ Fast-forward
- ❌ Frame advance
- ❌ Debugger tools
- ❌ Settings panel

## File Structure
```
gameboy-emulator-mvp/
├── server/
│   └── index.js              # Express server
├── public/
│   ├── index.html            # Single page app
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── main.js           # App entry
│       ├── cpu.js            # CPU emulation
│       ├── memory.js         # Memory management
│       ├── ppu.js            # Graphics (background only)
│       ├── apu.js            # Audio (1 channel)
│       ├── input.js          # Keyboard input
│       └── emulator.js       # Main emulator loop
├── package.json
└── README.md
```

## Implementation Priority
1. Express server setup (serve static files)
2. HTML/CSS UI (canvas + file input + controls)
3. Memory system (ROM loading, RAM)
4. CPU core (all opcodes)
5. PPU (background tiles only)
6. Input handling
7. Main emulator loop (60 FPS)
8. Basic audio (channel 1 square wave)

## Success Criteria
1. Load a .gb ROM file
2. Display background graphics correctly
3. Run at 60 FPS
4. Respond to keyboard input
5. Play basic audio

## Budget
Maximum: $75.00 USD

## Technical Requirements
- Run at 60 FPS on modern browsers
- Support Chrome 90+, Firefox 88+
- Canvas 2D rendering (no WebGL needed for MVP)
- Clean, modular code
- Basic inline documentation

## Test ROM
Use freely available homebrew test ROMs for development (no copyrighted ROMs included).
