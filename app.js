// --------------------------------------------------
// Western Arthurs Backpacking Planner
// Basic Cesium frontend version
// --------------------------------------------------

// 1. Add your Cesium ion token here
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlOTZhODNjNi05YmMzLTQ4YTItOTMyYi04YTlmZjkyNmU5YjgiLCJpZCI6Mzk2NDk5LCJzdWIiOiJhYmVvcmtpbiIsImlzcyI6Imh0dHBzOi8vYXBpLmNlc2l1bS5jb20iLCJhdWQiOiJBcnRodXJzX1RyYXZlcnNlIiwiaWF0IjoxNzc5NjY5NjIyfQ.5HeMkbWs3_GHhmHpeefbqtlSGUdDAZuYtefNUac57EQ";

// 2. File paths
const TRAIL_GEOJSON = "data/arthurs_western_trails.geojson";
const CAMPS_GEOJSON = "data/arthurs_western_camps.geojson";
const CAMPS_SNAPPED_GEOJSON = "data/arthurs_western_camps_snapped.geojson";
const PROFILE_JSON = "data/arthurs_western_profile_from_primary_gpx.json";

// Store data sources so layer toggles can control them
let trailDataSource = null;
let campsDataSource = null;

// Selected camp tracking
let selectedCampEntity = null;

let currentCampEntity = null;
let selectedItineraryCamps = [];
let snappedCampLookup = new Map();
let elevationProfile = [];

// --------------------------------------------------
// Custom triangle SVG marker
// --------------------------------------------------

function triangleMarkerSvg(color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <polygon points="17,3 31,30 3,30" fill="${color}" stroke="white" stroke-width="3"/>
    </svg>
  `;

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// --------------------------------------------------
// Create Cesium viewer
// --------------------------------------------------

const viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  timeline: false,
  animation: false,
  baseLayerPicker: true,
  geocoder: false,
  homeButton: true,
  sceneModePicker: true,
  navigationHelpButton: true,
  fullscreenButton: true,
  infoBox: false,
  selectionIndicator: false
});

// Improve terrain appearance
viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.scene.verticalExaggeration = 1.6;
viewer.scene.verticalExaggerationRelativeHeight = 0.0;
viewer.scene.globe.enableLighting = true;

// Fly camera to Western Arthurs area
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(146.30, -43.48, 40000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-50),
    roll: 0
  },
  duration: 2.5
});

// --------------------------------------------------
// Helper functions
// --------------------------------------------------

function getProperty(entity, fieldName, fallback = "Not specified") {
  if (!entity.properties) return fallback;

  const value = entity.properties[fieldName];

  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value.getValue === "function") {
    const resolved = value.getValue(Cesium.JulianDate.now());
    return resolved || fallback;
  }

  return value || fallback;
}

function buildCampDescription(entity) {
  const name = getProperty(entity, "name", "Unnamed camp");
  const campType = getProperty(entity, "camp_type");
  const water = getProperty(entity, "water_availability");
  const waterNotes = getProperty(entity, "water_notes");
  const tentSpots = getProperty(entity, "tent_spots");
  const platforms = getProperty(entity, "tent_platforms");
  const toilet = getProperty(entity, "toilet");
  const exposure = getProperty(entity, "exposure");
  const notes = getProperty(entity, "notes");

  return `
    <div class="camp-popup">
      <h2>${name}</h2>
      <p><strong>Type:</strong> ${campType}</p>
      <p><strong>Water availability:</strong> ${water}</p>
      <p><strong>Water notes:</strong> ${waterNotes}</p>
      <p><strong>Tent spots:</strong> ${tentSpots}</p>
      <p><strong>Tent platforms:</strong> ${platforms}</p>
      <p><strong>Toilet:</strong> ${toilet}</p>
      <p><strong>Exposure:</strong> ${exposure}</p>
      <p><strong>Notes:</strong> ${notes}</p>
    </div>
  `;
}

function updateSelectedCampPanel(entity) {
  const selectedCampDiv = document.getElementById("selectedCamp");

  const name = getProperty(entity, "name", "Unnamed camp");
  const campType = getProperty(entity, "camp_type");
  const water = getProperty(entity, "water_availability");
  const waterNotes = getProperty(entity, "water_notes");
  const tentSpots = getProperty(entity, "tent_spots");
  const platforms = getProperty(entity, "tent_platforms");
  const toilet = getProperty(entity, "toilet");
  const exposure = getProperty(entity, "exposure");
  const notes = getProperty(entity, "notes");

  selectedCampDiv.innerHTML = `
    <div class="selected-card">
      <h3>${name}</h3>
      <p><strong>Type:</strong> ${campType}</p>
      <p><strong>Water availability:</strong> ${water}</p>
      <p><strong>Water notes:</strong> ${waterNotes}</p>
      <p><strong>Tent spots:</strong> ${tentSpots}</p>
      <p><strong>Tent platforms:</strong> ${platforms}</p>
      <p><strong>Toilet:</strong> ${toilet}</p>
      <p><strong>Exposure:</strong> ${exposure}</p>
      <p><strong>Notes:</strong> ${notes}</p>
    </div>
  `;
}

// Selected marker turns orange
function setCampMarkerSelected(entity) {
  if (!entity || !entity.billboard) return;

  entity.billboard.image = triangleMarkerSvg("#f28c28"); // orange
  entity.billboard.scale = 1.15;
}

// Non-selected marker returns to red
function resetCampMarker(entity) {
  if (!entity || !entity.billboard) return;

  entity.billboard.image = triangleMarkerSvg("#d7191c"); // red
  entity.billboard.scale = 1.0;
}

// --------------------------------------------------
// Load trail GeoJSON
// --------------------------------------------------

async function loadTrail() {
  trailDataSource = await Cesium.GeoJsonDataSource.load(TRAIL_GEOJSON, {
    clampToGround: true,
    stroke: Cesium.Color.WHITE,
    strokeWidth: 4
  });

  viewer.dataSources.add(trailDataSource);

  const trailEntities = trailDataSource.entities.values;

  trailEntities.forEach((entity) => {
    if (entity.polyline) {
      entity.polyline.material = Cesium.Color.WHITE;
      entity.polyline.width = 4;
      entity.polyline.clampToGround = true;
    }
  });
}

// --------------------------------------------------
// Load camp GeoJSON
// --------------------------------------------------

async function loadCamps() {
  campsDataSource = await Cesium.GeoJsonDataSource.load(CAMPS_GEOJSON, {
    clampToGround: true
  });

  viewer.dataSources.add(campsDataSource);

  const campEntities = campsDataSource.entities.values;

  campEntities.forEach((entity) => {
    const name = getProperty(entity, "name", "Camp");

    entity.name = name;
    entity.description = buildCampDescription(entity);

    // Remove default GeoJSON marker styles
    entity.point = undefined;

    // Red triangle marker by default
    entity.billboard = new Cesium.BillboardGraphics({
      image: triangleMarkerSvg("#d7191c"), // red
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scale: 1.0
    });

    // Camp name below triangle with cream text box and black text
    entity.label = new Cesium.LabelGraphics({
      text: name,
      font: "11px Arial",
      fillColor: Cesium.Color.BLACK,
      outlineColor: Cesium.Color.TRANSPARENT,
      outlineWidth: 0,
      style: Cesium.LabelStyle.FILL,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#f3e6c8"),
      backgroundPadding: new Cesium.Cartesian2(7, 5),
      pixelOffset: new Cesium.Cartesian2(0, 10),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    });
  });
}

// --------------------------------------------------
// Click interaction for camp details
// --------------------------------------------------

function setupClickInteraction() {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement) => {
    const pickedObject = viewer.scene.pick(movement.position);

    if (!Cesium.defined(pickedObject) || !pickedObject.id) {
      return;
    }

    const entity = pickedObject.id;

    // Only interact with camp entities
    if (!entity.properties || !entity.billboard) {
      return;
    }

    // Reset previous selected camp marker
    if (selectedCampEntity && selectedCampEntity !== entity) {
      resetCampMarker(selectedCampEntity);
    }

    // Set selected camp marker to orange
    selectedCampEntity = entity;
    currentCampEntity = entity;
    setCampMarkerSelected(entity);

    // Update camp details panel
    updateSelectedCampPanel(entity);

    // Enable add button
    const addButton = document.getElementById("addToItinerary");
    if (addButton) {
      addButton.disabled = false;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// --------------------------------------------------
// Layer toggles
// --------------------------------------------------

function setupLayerToggles() {
  const toggleTrail = document.getElementById("toggleTrail");
  const toggleCamps = document.getElementById("toggleCamps");

  toggleTrail.addEventListener("change", () => {
    if (trailDataSource) {
      trailDataSource.show = toggleTrail.checked;
    }
  });

  toggleCamps.addEventListener("change", () => {
    if (campsDataSource) {
      campsDataSource.show = toggleCamps.checked;
    }
  });
}

// --------------------------------------------------
// Load elevation profile with camp markers
// --------------------------------------------------

async function loadElevationProfile() {
  const profileResponse = await fetch(PROFILE_JSON);

  if (!profileResponse.ok) {
    throw new Error(`Could not load elevation profile: ${profileResponse.status}`);
  }

  const profileData = await profileResponse.json();
  const profile = profileData.profile || [];
  elevationProfile = profile;

  const campsResponse = await fetch(CAMPS_SNAPPED_GEOJSON);

  if (!campsResponse.ok) {
    throw new Error(`Could not load snapped camps: ${campsResponse.status}`);
  }

  const campsData = await campsResponse.json();
  const campFeatures = campsData.features || [];

  buildSnappedCampLookup(campFeatures, profile);

  const distances = profile.map((point) => point.distance_km);

  const profileChartPoints = profile.map((point) => ({
    x: point.distance_km,
    y: point.elevation_smoothed_m ?? point.elevation_m
  }));

  const campMarkers = campFeatures
    .map((feature) => {
      const props = feature.properties || {};
      const chainage = Number(props.route_chainage_km);

      if (!Number.isFinite(chainage)) {
        return null;
      }

      const nearestProfilePoint = findNearestProfilePoint(profile, chainage);

      let campName = props.name || "Camp";

      if (props.camp_id === "trailhead" || campName.toLowerCase().includes("dman")) {
        campName = "Scotts Peak Dam Trailhead";
      }

      return {
        name: campName,
        campType: props.camp_type || "camp",
        distance_km: nearestProfilePoint.distance_km,
        elevation_m: nearestProfilePoint.elevation_smoothed_m ?? nearestProfilePoint.elevation_m
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance_km - b.distance_km)
    .map((camp, index) => {
      let labelPosition = "above";

      if (index < 3) {
        labelPosition = "above";
      } else if (index < 7) {
        labelPosition = "below";
      } else {
        labelPosition = "above";
      }

      return {
        ...camp,
        labelPosition
      };
    });

  const summary = profileData.summary || {};
  const profileStats = document.getElementById("profileStats");

  profileStats.textContent =
    `${summary.distance_km ?? "?"} km | ` +
    `min ${summary.elevation_min_m ?? "?"} m | ` +
    `max ${summary.elevation_max_m ?? "?"} m | ` +
    `gain ${summary.approx_elevation_gain_m_smoothed ?? "?"} m`;

  const ctx = document.getElementById("elevationChart").getContext("2d");

  const campLabelPlugin = {
    id: "campLabelPlugin",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const xScale = scales.x;
      const yScale = scales.y;

      ctx.save();

      campMarkers.forEach((camp) => {
        const x = xScale.getPixelForValue(camp.distance_km);
        const y = yScale.getPixelForValue(camp.elevation_m);

        if (
          x < chartArea.left ||
          x > chartArea.right ||
          y < chartArea.top ||
          y > chartArea.bottom
        ) {
          return;
        }

        // White camp dot
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#111111";
        ctx.stroke();

        // Vertical camp name
        const labelOffset = camp.labelPosition === "above" ? -10 : 10;
        const textY = y + labelOffset;

        ctx.translate(x, textY);
        ctx.rotate(-Math.PI / 2);

        ctx.font = "11px Arial";
        ctx.textAlign = camp.labelPosition === "above" ? "left" : "right";
        ctx.textBaseline = "middle";

        // White text with black outline
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;

        ctx.strokeText(camp.name, 0, 0);
        ctx.fillText(camp.name, 0, 0);

        ctx.rotate(Math.PI / 2);
        ctx.translate(-x, -textY);
      });

      ctx.restore();
    }
  };

  new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Elevation (m)",
          data: profileChartPoints,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15
        }
      ]
    },
    plugins: [campLabelPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: function (items) {
              return `${items[0].parsed.x.toFixed(2)} km`;
            },
            label: function (item) {
              return `Elevation: ${item.parsed.y.toFixed(0)} m`;
            }
          }
        }
      },
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: Math.ceil(Math.max(...distances)),
          ticks: {
            maxTicksLimit: 8,
            color: "#c7d0d9",
            callback: function (value) {
              return `${Math.round(value)} km`;
            }
          },
          grid: {
            color: "rgba(255,255,255,0.08)"
          }
        },
        y: {
          ticks: {
            color: "#c7d0d9",
            callback: function (value) {
              return `${value} m`;
            }
          },
          grid: {
            color: "rgba(255,255,255,0.08)"
          }
        }
      }
    }
  });
}

function findNearestProfilePoint(profile, targetDistanceKm) {
  let nearest = profile[0];
  let smallestDifference = Math.abs(profile[0].distance_km - targetDistanceKm);

  for (const point of profile) {
    const difference = Math.abs(point.distance_km - targetDistanceKm);

    if (difference < smallestDifference) {
      nearest = point;
      smallestDifference = difference;
    }
  }

  return nearest;
}

// --------------------------------------------------
// Itinerary builder
// --------------------------------------------------

function normaliseId(value) {
  return String(value || "").trim().toLowerCase();
}

function formatSignedMetres(value) {
  const rounded = Math.round(value);

  if (rounded > 0) {
    return `+${rounded} m`;
  }

  return `${rounded} m`;
}

function formatDistance(value) {
  return `${Number(value).toFixed(2)} km`;
}

function buildSnappedCampLookup(campFeatures, profile) {
  snappedCampLookup.clear();

  campFeatures.forEach((feature) => {
    const props = feature.properties || {};

    const campId = props.camp_id || "";
    const rawCampId = props.raw_camp_id || "";
    let campName = props.name || "Camp";

    if (campId === "trailhead" || campName.toLowerCase().includes("dman")) {
      campName = "Scotts Peak Dam Trailhead";
    }

    const chainage = Number(props.route_chainage_km);

    if (!Number.isFinite(chainage)) {
      return;
    }

    const nearestProfilePoint = findNearestProfilePoint(profile, chainage);

    const campData = {
      camp_id: campId,
      raw_camp_id: rawCampId,
      name: campName,
      camp_type: props.camp_type || "camp",
      route_chainage_km: nearestProfilePoint.distance_km,
      elevation_m: nearestProfilePoint.elevation_smoothed_m ?? nearestProfilePoint.elevation_m
    };

    // Store multiple lookup keys so the display camp and snapped camp can match reliably
    snappedCampLookup.set(normaliseId(campId), campData);
    snappedCampLookup.set(normaliseId(rawCampId), campData);
    snappedCampLookup.set(normaliseId(campName), campData);
  });
}

function getItineraryCampFromEntity(entity) {
  const campId = getProperty(entity, "camp_id", "");
  const rawCampId = getProperty(entity, "raw_camp_id", "");
  const name = getProperty(entity, "name", "");

  let matchedCamp =
    snappedCampLookup.get(normaliseId(campId)) ||
    snappedCampLookup.get(normaliseId(rawCampId)) ||
    snappedCampLookup.get(normaliseId(name));

  if (!matchedCamp) {
    console.warn("No snapped camp match found for:", name, campId, rawCampId);
    return null;
  }

  return matchedCamp;
}

function addCurrentCampToItinerary() {
  if (!currentCampEntity) {
    return;
  }

  const campData = getItineraryCampFromEntity(currentCampEntity);

  if (!campData) {
    return;
  }

  // Duplicate clicks do nothing
  const alreadySelected = selectedItineraryCamps.some(
    (camp) => normaliseId(camp.camp_id) === normaliseId(campData.camp_id)
  );

  if (alreadySelected) {
    return;
  }

  selectedItineraryCamps.push(campData);

  // Enforce route order
  selectedItineraryCamps.sort(
    (a, b) => a.route_chainage_km - b.route_chainage_km
  );

  renderItinerary();
}

function undoLastItineraryCamp() {
  if (selectedItineraryCamps.length === 0) {
    return;
  }

  selectedItineraryCamps.pop();
  renderItinerary();
}

function clearItinerary() {
  selectedItineraryCamps = [];
  renderItinerary();
}

function renderItinerary() {
  const itineraryDiv = document.getElementById("itineraryList");
  const undoButton = document.getElementById("undoItinerary");
  const clearButton = document.getElementById("clearItinerary");

  if (!itineraryDiv) {
    return;
  }

  undoButton.disabled = selectedItineraryCamps.length === 0;
  clearButton.disabled = selectedItineraryCamps.length === 0;

  if (selectedItineraryCamps.length === 0) {
    itineraryDiv.className = "itinerary-empty";
    itineraryDiv.innerHTML = "No camps added yet.";
    return;
  }

  itineraryDiv.className = "";

  let html = "";

  selectedItineraryCamps.forEach((camp, index) => {
    html += `
      <div class="itinerary-item">
        <strong>${index + 1}. ${camp.name}</strong>
        <div class="itinerary-meta">
          ${formatDistance(camp.route_chainage_km)} along route |
          ${Math.round(camp.elevation_m)} m elevation
        </div>
      </div>
    `;

    const nextCamp = selectedItineraryCamps[index + 1];

    if (nextCamp) {
      const legDistance = nextCamp.route_chainage_km - camp.route_chainage_km;
      const legElevationDifference = nextCamp.elevation_m - camp.elevation_m;

      html += `
        <div class="itinerary-leg">
          ↓ ${formatDistance(legDistance)} |
          elevation difference ${formatSignedMetres(legElevationDifference)}
        </div>
      `;
    }
  });

  if (selectedItineraryCamps.length >= 2) {
    const firstCamp = selectedItineraryCamps[0];
    const lastCamp = selectedItineraryCamps[selectedItineraryCamps.length - 1];

    const totalDistance = lastCamp.route_chainage_km - firstCamp.route_chainage_km;
    const netElevationDifference = lastCamp.elevation_m - firstCamp.elevation_m;

    html += `
      <div class="itinerary-summary">
        <strong>Route summary</strong><br>
        Start: ${firstCamp.name}<br>
        End: ${lastCamp.name}<br>
        Total selected distance: ${formatDistance(totalDistance)}<br>
        Net elevation difference: ${formatSignedMetres(netElevationDifference)}<br>
        Selected points: ${selectedItineraryCamps.length}
      </div>
    `;
  } else {
    html += `
      <div class="itinerary-summary">
        Add at least two camps to calculate route distance and elevation difference.
      </div>
    `;
  }

  itineraryDiv.innerHTML = html;
}

function setupItineraryControls() {
  const addButton = document.getElementById("addToItinerary");
  const undoButton = document.getElementById("undoItinerary");
  const clearButton = document.getElementById("clearItinerary");

  addButton.addEventListener("click", addCurrentCampToItinerary);
  undoButton.addEventListener("click", undoLastItineraryCamp);
  clearButton.addEventListener("click", clearItinerary);

  renderItinerary();
}

// --------------------------------------------------
// Start app
// --------------------------------------------------

async function startApp() {
  try {
    await loadTrail();
await loadCamps();
await loadElevationProfile();

setupClickInteraction();
setupLayerToggles();
setupItineraryControls();

    console.log("Western Arthurs planner loaded successfully.");
  } catch (error) {
    console.error("Error loading Western Arthurs planner:", error);
    alert("Something failed to load. Check the console and confirm your data file paths are correct.");
  }
}

startApp();