const GEOJSON_LAYERS = [
  {
    id: 'fixedAll',
    label: 'Fixed_All 폴리곤',
    path: './layer/fixed_all.geojson',
    type: 'polygon',
  },
  {
    id: 'touching',
    label: 'Touching 폴리곤',
    path: './layer/touching.geojson',
    type: 'polygon',
  },
 {
    id: 'emd',
    label: 'EMD 폴리곤',
    path: './layer/emd.geojson',
    type: 'polygon',
  },
];

const drawnItems = new L.FeatureGroup();
const geoJsonData = [];

const SATELLITE_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const POLYGON_STYLE = {
  color: '#ffffff',
  weight: 2,
  fill: true,
  fillColor: '#ffffff',
  fillOpacity: 0.5,
};

const EMD_STYLE = {
  color: '#00d3ff',
  weight: 1,
  fillOpacity: 0,
};

const TOUCHING_STYLE = {
  color: '#ff0000',
  weight: 2,
  fillColor: '#ff0000',
  fillOpacity: 0.2,
};

function createMap() {
  const map = L.map('map', {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 18,
  }).setView([34.45, 126.22], 11);

  L.tileLayer(SATELLITE_TILES, {
    attribution:
      '&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    minZoom: 5,
    maxZoom: 18,
  }).addTo(map);

  L.control.scale({
    metric: true,
    imperial: false,
  }).addTo(map);

  return map;
}

function addDrawingControl(map) {
  drawnItems.addTo(map);

  const drawControl = new L.Control.Draw({
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#3388ff',
          weight: 2,
          fillColor: '#3388ff',
          fillOpacity: 0.2,
          className: 'drawn-polygon',
        },
      },
      polyline: false,
      rectangle: false,
      circle: false,
      marker: false,
      circlemarker: false,
    },
    edit: {
      featureGroup: drawnItems,
      remove: true,
    },
  });

  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, (event) => {
    const layer = event.layer;
    drawnItems.addLayer(layer);
    setDrawnLayerInteraction(layer, false);
    updateDrawnLayerLabels();
  });

  map.on('draw:editstart', () => {
    setDrawnLayersInteraction(true);
  });

  map.on('draw:editstop', () => {
    setDrawnLayersInteraction(false);
  });

  map.on('draw:deletestart', () => {
    setDrawnLayersInteraction(true);
  });

  map.on('draw:deletestop', () => {
    setDrawnLayersInteraction(false);
    updateDrawnLayerLabels();
  });
}

function setDrawnLayerInteraction(layer, enabled) {
  if (!layer) {
    return;
  }

  if (layer._path) {
    layer._path.style.pointerEvents = enabled ? '' : 'none';
  }

  if (typeof layer.setStyle === 'function') {
    layer.options.interactive = enabled;
  }
}

function setDrawnLayersInteraction(enabled) {
  drawnItems.eachLayer((layer) => {
    setDrawnLayerInteraction(layer, enabled);
  });
}

function updateDrawnLayerLabels() {
  const layers = drawnItems.getLayers();
  layers.forEach((layer, index) => {
    const label = `폴리곤${index + 1}`;
    layer.drawnPolygon = label;

    if (layer.getTooltip()) {
      layer.setTooltipContent(label);
    } else {
      layer.bindTooltip(label, {
        permanent: true,
        direction: 'center',
        className: 'drawn-polygon-label',
        interactive: false,
      }).openTooltip();
    }
  });
}

function registerExportButton() {
  const exportButton = document.getElementById('export-btn');
  if (!exportButton) {
    return;
  }

  exportButton.addEventListener('click', () => {
    let exportData = getSelectedGeoJsonProperties();
    if (exportData.length === 0) {
      alert('먼저 맵에서 영역을 그린 다음에 다시 시도하세요.');
      return;
    }

    exportData = deduplicateSelectedFeatures(exportData);
    const csvText = convertPropertiesToCsv(exportData);
    downloadCsv(csvText, `Address_${formatTimestamp()}.csv`);
  });
}

function registerSaveLoadButtons() {
  const saveButton = document.getElementById('save-polygons-btn');
  const loadButton = document.getElementById('load-polygons-btn');
  const fileInput = document.getElementById('load-polygons-input');

  if (saveButton) {
    saveButton.addEventListener('click', () => {
      const data = getSavedPolygons();
      if (!data.features.length) {
        alert('저장할 폴리곤이 없습니다. 먼저 폴리곤을 그려주세요.');
        return;
      }

      downloadJson(data, `Polygon_${formatTimestamp()}.json`);
    });
  }

  if (loadButton && fileInput) {
    loadButton.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const text = await file.text();
      try {
        const sanitized = text.replace(/^\ufeff/, '');
        const data = JSON.parse(sanitized);
        loadSavedPolygons(data);
      } catch (error) {
        console.error('JSON load error:', error);
        alert('잘못된 파일 형식입니다. JSON 파일을 선택해주세요.');
      }

      fileInput.value = '';
    });
  }
}

function getSavedPolygons() {
  const features = [];

  drawnItems.eachLayer((layer) => {
    const geoJson = layer.toGeoJSON();
    geoJson.properties = geoJson.properties || {};
    geoJson.properties.drawnPolygon = layer.drawnPolygon ?? '';
    features.push(geoJson);
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

function downloadJson(data, fileName) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  const minute = pad(now.getMinutes());
  return `${year}_${month}${day}_${hour}${minute}`;
}

function loadSavedPolygons(data) {
  if (!data || typeof data !== 'object') {
    alert('지원되지 않는 폴리곤 파일입니다.');
    return;
  }

  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    alert('지원되지 않는 폴리곤 형식입니다. FeatureCollection이 필요합니다.');
    return;
  }

  if (typeof drawnItems.clearLayers === 'function') {
    drawnItems.clearLayers();
  }

  data.features.forEach((feature) => {
    if (feature?.type !== 'Feature' || !feature.geometry) {
      return;
    }

    addLoadedPolygon(feature);
  });
  updateDrawnLayerLabels();
}

function addLoadedPolygon(feature) {
  const layer = L.geoJSON(feature, {
    style: {
      color: '#3388ff',
      weight: 2,
      fillColor: '#3388ff',
      fillOpacity: 0.2,
    },
  }).getLayers()[0];

  layer.drawnPolygon = feature.properties?.drawnPolygon ?? '';
  drawnItems.addLayer(layer);
  setDrawnLayerInteraction(layer, false);
}

function deduplicateSelectedFeatures(items) {
  const priority = {
    touching: 1,
    fixedAll: 2,
  };

  const map = new Map();

  items.forEach((item) => {
    const address = typeof item.ADDRESS === 'string'
      ? item.ADDRESS.trim()
      : '';
    const pnu = typeof item.PNU === 'string'
      ? item.PNU.trim()
      : '';
    const identifier = address || pnu || JSON.stringify({});
    const key = `${item.drawnPolygon}|${identifier}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      return;
    }

    const currentPriority = priority[item.sourceLayerId] ?? Number.MAX_SAFE_INTEGER;
    const existingPriority = priority[existing.sourceLayerId] ?? Number.MAX_SAFE_INTEGER;

    if (currentPriority < existingPriority) {
      map.set(key, item);
    }
  });

  return Array.from(map.values());
}

function sortedProperties(properties) {
  if (!properties || typeof properties !== 'object') {
    return properties;
  }

  return Object.keys(properties).sort().reduce((result, key) => {
    result[key] = properties[key];
    return result;
  }, {});
}

function getSelectedGeoJsonProperties() {
  const drawnLayers = drawnItems.getLayers();
  if (!drawnLayers || drawnLayers.length === 0) {
    return [];
  }

  const selected = [];

  drawnLayers.forEach((layer, drawnIndex) => {
    const drawingFeature = layer.toGeoJSON();
    const drawingLabel = `폴리곤${drawnIndex + 1}`;

    for (const { layerInfo, data } of geoJsonData) {
      if (!data?.features) {
        continue;
      }

      for (const feature of data.features) {
        if (!feature.geometry) {
          continue;
        }

        try {
          const fullyContained = turf.booleanWithin(feature, drawingFeature);

          if (fullyContained && layerInfo.id !== 'emd') {
            selected.push({
              drawnPolygon: layer.drawnPolygon || drawingLabel,
              layer: layerInfo.id === 'touching' ? '인접 필지' : '일반',
              sourceLayerId: layerInfo.id,
              ADDRESS: feature.properties?.ADDRESS ?? '',
              PNU: feature.properties?.PNU ?? '',
            });
          }
        } catch (error) {
          // Ignore invalid geometry comparisons.
        }
      }
    }
  });

  return selected;
}

function convertPropertiesToCsv(items) {
  const outputHeaders = ['폴리곤 구분', '필지 구분', '주소', 'PNU'];
  const fieldKeys = ['drawnPolygon', 'layer', 'ADDRESS', 'PNU'];
  const rows = [outputHeaders.join(',')];

  const sortedItems = items.slice().sort((a, b) => {
    const polyA = parsePolygonIndex(a.drawnPolygon);
    const polyB = parsePolygonIndex(b.drawnPolygon);
    if (polyA !== polyB) {
      return polyA - polyB;
    }

    const order = { '일반': 1, '인접 필지': 2 };
    const layerA = order[a.layer] ?? 99;
    const layerB = order[b.layer] ?? 99;
    if (layerA !== layerB) {
      return layerA - layerB;
    }

    return String(a.ADDRESS).localeCompare(String(b.ADDRESS), 'ko');
  });

  sortedItems.forEach((item) => {
    const row = fieldKeys.map((key) => escapeCsvValue(item[key]));
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

function parsePolygonIndex(label) {
  const match = /폴리곤(\d+)$/u.exec(String(label));
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function downloadCsv(csvText, fileName) {
  const bom = '\ufeff';
  const blob = new Blob([bom + csvText], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatPopup(layerInfo, props) {
  const popupLines = [];

  if (layerInfo.id === 'fixedAll' || layerInfo.id === 'touching') {
    if (props.ADDRESS !== undefined) {
      popupLines.push(`<strong>주소</strong>: ${props.ADDRESS}`);
    }
  }

  return popupLines.join('<br />');
}

function createFeatureLayer(data, layerInfo) {
  let style;

  if (layerInfo.id === 'touching') {
    style = TOUCHING_STYLE;
  } else if (layerInfo.id === 'emd') {
    style = EMD_STYLE;
  } else {
    style = POLYGON_STYLE;
  }

  const interactive = layerInfo.id !== 'emd';

  return L.geoJSON(data, {
    style() {
      return style;
    },
    interactive,
    onEachFeature(feature, layer) {
      if (!interactive) {
        return;
      }

      const popupContent = formatPopup(layerInfo, feature.properties ?? {});
      if (popupContent) {
        layer.bindPopup(popupContent);
      }
    },
  });
}

async function loadGeoJson(map) {
  let totalBounds = null;

  for (const layerInfo of GEOJSON_LAYERS) {
    const response = await fetch(layerInfo.path);
    const data = await response.json();
    geoJsonData.push({ layerInfo, data });

    const geoJsonLayer = createFeatureLayer(data, layerInfo).addTo(map);
    const bounds = geoJsonLayer.getBounds();

    if (bounds.isValid()) {
      totalBounds = totalBounds
        ? totalBounds.extend(bounds)
        : bounds;
    }
  }

  if (totalBounds?.isValid()) {
    map.fitBounds(totalBounds, {
      padding: [30, 30],
      maxZoom: 17,
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const map = createMap();
  addDrawingControl(map);
  registerExportButton();
  registerSaveLoadButtons();
  loadGeoJson(map);
});