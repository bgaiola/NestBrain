# 🧠 NestBrain

**Cutting optimization software for panel and sheet materials.**

NestBrain helps furniture makers, carpenters, and manufacturers minimize waste when cutting rectangular pieces from standard sheet materials (melamine, MDF, plywood, etc.).

![NestBrain](https://img.shields.io/badge/version-1.0.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **🧮 Smart Optimization** — Tries 6 different sorting strategies and picks the best result. Supports both guillotine and free-form (MaxRects) cutting.
- **🌾 Grain Direction** — Respects grain orientation (horizontal, vertical, none) for both pieces and materials.
- **📥 CSV Import/Export** — Import pieces and materials from CSV files. Multi-language column headers supported.
- **🏷️ Edge Banding** — Track edge bands (cantos) for all four sides of each piece.
- **📊 Visual Cutting Plans** — SVG-based visualization of cutting layouts with color-coded pieces.
- **🌍 Multi-Language** — Available in Español, Português (BR), English, Français, and Italiano.
- **📋 Reports & Labels** — Generate reports and cutting labels for the workshop.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/bgaiola/NestBrain.git
cd NestBrain

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
npm run preview
```

## 📖 Usage

1. **Add Materials** — Define your sheet materials (dimensions, grain, trim margins) or import from CSV.
2. **Add Pieces** — Enter the pieces to cut (dimensions, quantity, grain, edge bands) or import from CSV.
3. **Optimize** — Click "Optimize" to generate cutting plans.
4. **Review Results** — Browse the visual cutting plans, utilization stats, and scrap areas.
5. **Export** — Print labels and reports for the workshop.

### Test Data

Sample CSV files are included in the `test-data/` folder:
- `materiales.csv` — 12 sample materials
- `piezas.csv` — 82 piece entries for a realistic furniture project

## 🛠️ Tech Stack

- **React 18** + **TypeScript**
- **Vite 5** — Fast build tooling
- **Tailwind CSS** — Utility-first styling
- **Zustand** — Lightweight state management
- **Lucide React** — Icons

## 📄 License

MIT License — free for personal and commercial use.

---

Made with ❤️ for the woodworking community.
