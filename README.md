<p align="center"><img width="120" src="./src/public/favicon.png"></p>
<h2 align="center">TRIP</h2>

<div align="center">

![Status](https://img.shields.io/badge/status-active-success?style=for-the-badge)
[![GitHub Issues](https://img.shields.io/github/issues/itskovacs/trip?style=for-the-badge&color=ededed)](https://github.com/itskovacs/trip/issues)
[![License](https://img.shields.io/badge/license-_CC_BY_NC_SA_4.0-2596be?style=for-the-badge)](/LICENSE)

</div>

<p align="center">🗺️ Tourism and Recreational Interest Points</p>
<br>

<div align="center">

![TRIP Planning](./.github/screenshot.png)

</div>

## 📝 Table of Contents

- 📦 [About](#about)
- 🌱 [Getting Started](#getting_started)
- 📸 [Demo](#demo)
- 🤝 [Contributing](#contributing)
- 📜 [License](#license)
- 🛠️ [Tech Stack](#techstack)

## 📦 About <a name = "about"></a>

TRIP is a self-hostable **minimalist Map tracker** and **Trip planner** to visualize your points of interest (POI) and organize your next adventure details.

**Core Features:**
- Map and manage POIs on interactive maps
- Plan multi-day trips with detailed itineraries
- Collaborate and share with travel companions

No telemetry. No tracking. No ads. Free, forever.

See the [📸 demo](#demo) to explore TRIP in action.

<br>

## 🌱 Getting Started <a name = "getting_started"></a>

If you need help, feel free to open an [issue](https://github.com/itskovacs/trip/issues).

Deployment is designed to be simple using Docker.

### Option 1: Docker Compose (Recommended)

Use the `docker-compose.yml` file provided in this repository. No changes are required, though you may customize it to suit your needs.

Run the container:

```bash
docker-compose up -d
```

### Option 2: Docker Run

```bash
# Ensure you have the latest image
docker pull ghcr.io/itskovacs/trip:1

# Run the container
docker run -d -p 8080:8000 -v ./storage:/app/storage ghcr.io/itskovacs/trip:1
```

### Configuration

Refer to the [configuration documentation](https://github.com/itskovacs/trip/tree/main/docs/config.md) to set up OIDC authentication and other settings.

> [!TIP]
> See [Usage Tips](https://github.com/itskovacs/trip/tree/main/docs/usage_tips.md) in docs for advanced features.

<br>

## 📸 Demo <a name = "demo"></a>

A demo is available at [itskovacs-trip.netlify.app](https://itskovacs-trip.netlify.app/).

<div align="center">

|         |         |
|:-------:|:-------:|
| ![](./.github/sc_map.png) | ![](./.github/sc_map_filters_list.png) |
| ![](./.github/sc_trip.png) | ![](./.github/sc_trips.png) |

</div>

<br>

## 🤝 Contributing <a name = "contributing"></a>

Contributions are welcome! Open an issue to report bugs, start a discussion to share ideas or submit a pull request for new features.

1. Fork the repository
2. Create a new branch (`my-new-trip-feature`)
3. Commit and push your changes
4. Open a pull request

TRIP is and will always remain completely free, no paywalled features, no telemetry, no tracking, no ads. Development is supported through optional donations. If TRIP helps plan your adventures, consider [leaving a small tip](https://ko-fi.com/itskovacs) ☕.

<br>

## 📜 License <a name = "license"></a>

TRIP is licensed under the **CC BY-NC-SA 4.0**. You may use, modify, and share freely with attribution, but **commercial use is strictly prohibited**.

<br>

## 🛠️ Tech Stack <a name = "techstack"></a>

### **Frontend**

- 🅰️ Angular 20
- 🏗️ PrimeNG 20
- 🎨 Tailwind CSS 4
- 🗺️ Leaflet 1.9 (plugins: [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster), [Leaflet.contextmenu](https://github.com/aratcliffe/Leaflet.contextmenu))

### **Backend**

- 🐍 FastAPI, SQLModel
- 🗃️ SQLite

<br>


<div align="center">

If you like TRIP, consider giving it a **star** ⭐!  
Made with ❤️ in BZH  

<a href='https://ko-fi.com/itskovacs' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi1.png' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>  
</div>
