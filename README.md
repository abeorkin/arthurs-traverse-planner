# Western Arthurs Backpacking Planner

An interactive 3D web map for planning a backpacking route through the Western Arthur Range in Southwest Tasmania.

## Features

- 3D Cesium terrain visualisation
- Western Arthurs route line
- Camp and waypoint markers
- Campsite details including water, tent spots and platforms
- Elevation profile generated from GPX data
- Camp labels on elevation profile
- Route-order itinerary builder
- Distance and elevation difference between selected camps
- Weather and safety resource links

## Data

The route and campsite data were prepared from GPX and manually entered campsite information. Camps were snapped to the nearest trail position for route/elevation calculations while keeping the original display locations.

## Architecture

This is a lightweight static frontend web GIS application.

- Presentation tier: HTML, CSS, CesiumJS interface
- Application tier: JavaScript interaction and route logic
- Data tier: GeoJSON and JSON files, plus Cesium terrain services

## Disclaimer

This app is a planning and portfolio tool only. It is not a replacement for official maps, current Parks Tasmania advice, weather forecasts, navigation skills or emergency planning.