# 3D Browser

A modern 3D model browser built with React, Three.js, and Vite. This application allows you to view and interact with 3D models in a web browser with an intuitive interface.

## Features

- **3D Model Viewer**: Load and display various 3D model formats
- **Interactive Controls**: Rotate, zoom, and pan around 3D models
- **Scene Management**: Organize and manage multiple 3D objects
- **Properties Panel**: View and edit object properties in real-time
- **Settings Panel**: Customize viewer settings and preferences
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: React 19, TypeScript
- **3D Engine**: Three.js
- **Build Tool**: Vite
- **3D Formats**: Support for various 3D file formats
- **Styling**: CSS-in-JS with modern design

## Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd 3dbrowser
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (if needed):
   ```bash
   # Copy the example environment file
   cp .env.local.example .env.local
   
   # Edit .env.local and add your API keys if required
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Project Structure

```
3dbrowser/
├── components/          # React components
│   ├── ConfirmModal.tsx
│   ├── LoadingOverlay.tsx
│   ├── MenuBar.tsx
│   ├── PropertiesPanel.tsx
│   ├── SceneTree.tsx
│   ├── SettingsPanel.tsx
│   └── ToolPanels.tsx
├── public/              # Static assets
├── src/                 # Source code
│   ├── index.tsx        # Main application entry
│   ├── SceneManager.ts  # 3D scene management
│   └── ...
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
