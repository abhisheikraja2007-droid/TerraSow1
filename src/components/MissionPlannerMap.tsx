import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Layers,
  MapPin,
  Crosshair,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  RotateCcw,
  Compass,
  Sparkles,
  Ruler,
  Globe,
  Navigation,
  LocateFixed,
  Loader2,
} from 'lucide-react';
import { Waypoint, VehicleTelemetry, CropProfile } from '../types';
import { playClickSound, playBeepSound } from '../utils/audio';
import { hapticLight, hapticMedium, hapticSuccess } from '../utils/haptics';
import { generateFieldGrid } from '../data/missionPlannerData';

interface MissionPlannerMapProps {
  waypoints: Waypoint[];
  onWaypointsChange: React.Dispatch<React.SetStateAction<Waypoint[]>>;
  telemetry: VehicleTelemetry;
  selectedCrop: CropProfile;
  activeWpIndex?: number;
  swathWidthMeters: number;
  mapType?: 'satellite_map' | 'hud_grid';
  onUpdateTelemetry?: React.Dispatch<React.SetStateAction<VehicleTelemetry>>;
}

type MapLayerType = 'satellite' | 'dark' | 'osm' | 'terrain';

export const MissionPlannerMap: React.FC<MissionPlannerMapProps> = ({
  waypoints,
  onWaypointsChange,
  telemetry,
  selectedCrop,
  activeWpIndex = 0,
  swathWidthMeters,
  onUpdateTelemetry,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tractorMarkerRef = useRef<L.Marker | null>(null);
  const userLocationMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);
  const headingLineRef = useRef<L.Polyline | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const breadcrumbsRef = useRef<L.Polyline | null>(null);

  const [activeLayer, setActiveLayer] = useState<MapLayerType>('satellite');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapMode, setMapMode] = useState<'view' | 'add_waypoint' | 'draw_boundary' | 'measure'>('view');
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([]);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [measuredDistance, setMeasuredDistance] = useState<number | null>(null);
  const [isRoverEnabled, setIsRoverEnabled] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationToast, setLocationToast] = useState<string | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialLat = userLocation?.lat || 20.5937;
    const initialLng = userLocation?.lng || 78.9629;
    const initialZoom = userLocation ? 18 : 5;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: false,
    });

    // Default Esri World Imagery (Satellite)
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 20,
        maxNativeZoom: 19,
      }
    ).addTo(map);

    tileLayerRef.current = satelliteLayer;

    // Layer group for waypoints and lines
    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;

    // Breadcrumbs trail
    const breadcrumbs = L.polyline([], {
      color: '#4ade80',
      weight: 3,
      opacity: 0.6,
      dashArray: '2, 4',
    }).addTo(map);
    breadcrumbsRef.current = breadcrumbs;

    mapInstanceRef.current = map;



    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Map Click Handler for Map Modes (Add WP, Draw Boundary, Measure)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;

      if (mapMode === 'add_waypoint') {
        playClickSound();
        hapticLight();
        onWaypointsChange((prev) => {
          const newWp: Waypoint = {
            index: prev.length,
            command: 'WAYPOINT',
            lat,
            lng,
            alt: 0,
            param1: 0,
            param2: 1.0,
            param3: 0,
            param4: 0,
            seederActive: true,
            speedKmh: 8.5,
            targetDepthCm: parseFloat(selectedCrop.sowingDepth) || 4.0,
            targetSpacingCm: parseFloat(selectedCrop.seedSpacing) || 18.0,
          };
          return [...prev, newWp];
        });
      } else if (mapMode === 'draw_boundary') {
        playClickSound();
        hapticLight();
        setBoundaryPoints((prev) => [...prev, [lat, lng]]);
      } else if (mapMode === 'measure') {
        playClickSound();
        setMeasurePoints((prev) => {
          const updated: [number, number][] = [...prev, [lat, lng]];
          if (updated.length >= 2) {
            let totalDist = 0;
            for (let i = 1; i < updated.length; i++) {
              const p1 = L.latLng(updated[i - 1][0], updated[i - 1][1]);
              const p2 = L.latLng(updated[i][0], updated[i][1]);
              totalDist += p1.distanceTo(p2);
            }
            setMeasuredDistance(totalDist);
          }
          return updated;
        });
      }
    };

    map.on('click', onMapClick);

    return () => {
      map.off('click', onMapClick);
    };
  }, [mapMode, selectedCrop]);

  // Update Tile Layer
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = '';
    let maxZoom = 19;

    switch (activeLayer) {
      case 'satellite':
        url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        maxZoom = 20;
        break;
      case 'dark':
        url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        break;
      case 'osm':
        url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        break;
      case 'terrain':
        url = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
        maxZoom = 17;
        break;
    }

    const newLayer = L.tileLayer(url, { maxZoom }).addTo(map);
    tileLayerRef.current = newLayer;
  }, [activeLayer]);

  // Render Waypoints & Swaths & Paths on Map
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    // Invalidate map size to ensure tiles render properly
    map.invalidateSize();

    // 1. Draw Field Boundary if points exist
    if (boundaryPoints.length >= 3) {
      L.polygon(boundaryPoints, {
        color: '#38bdf8',
        weight: 2.5,
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
        dashArray: '5, 5',
      }).addTo(layerGroup);
    } else if (boundaryPoints.length > 0) {
      L.polyline(boundaryPoints, {
        color: '#38bdf8',
        weight: 2,
        dashArray: '4, 4',
      }).addTo(layerGroup);
      boundaryPoints.forEach(([lat, lng]) => {
        L.circleMarker([lat, lng], {
          radius: 5,
          color: '#38bdf8',
          fillColor: '#ffffff',
          fillOpacity: 1,
        }).addTo(layerGroup);
      });
    }

    // 2. Draw Measure Line if active
    if (measurePoints.length >= 2) {
      L.polyline(measurePoints, {
        color: '#f43f5e',
        weight: 3,
        dashArray: '6, 6',
      }).addTo(layerGroup);
      measurePoints.forEach(([lat, lng]) => {
        L.circleMarker([lat, lng], {
          radius: 6,
          color: '#f43f5e',
          fillColor: '#ffffff',
          fillOpacity: 1,
        }).addTo(layerGroup);
      });
    }

    // 3. Draw Swath Ribbons & Connecting Paths
    const swathOffsetDeg = (swathWidthMeters / 2) * 0.0000105;

    for (let i = 1; i < waypoints.length; i++) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      const isSeeding = curr.seederActive || prev.seederActive;

      if (isSeeding) {
        // Draw Swath Coverage Rectangle Band
        const swathPolygon = [
          [prev.lat, prev.lng - swathOffsetDeg],
          [prev.lat, prev.lng + swathOffsetDeg],
          [curr.lat, curr.lng + swathOffsetDeg],
          [curr.lat, curr.lng - swathOffsetDeg],
        ] as [number, number][];

        L.polygon(swathPolygon, {
          color: '#22c55e',
          weight: 1,
          fillColor: '#4ade80',
          fillOpacity: 0.35,
        }).addTo(layerGroup);

        // Center centerline
        L.polyline(
          [
            [prev.lat, prev.lng],
            [curr.lat, curr.lng],
          ],
          {
            color: '#15803d',
            weight: 3.5,
            opacity: 1,
          }
        ).addTo(layerGroup);
      } else {
        // Headland turn or transit (amber dashed)
        L.polyline(
          [
            [prev.lat, prev.lng],
            [curr.lat, curr.lng],
          ],
          {
            color: '#f59e0b',
            weight: 2.5,
            opacity: 0.9,
            dashArray: '6, 6',
          }
        ).addTo(layerGroup);
      }
    }

    // 4. Draw Waypoint Markers
    waypoints.forEach((wp, idx) => {
      const isCurrent = idx === activeWpIndex;
      const isServo = wp.command === 'DO_SET_SERVO';
      const isRTL = wp.command === 'RETURN_TO_LAUNCH';

      let bgColor = '#ffffff';
      let textColor = '#012d1d';
      let borderColor = '#0A0A0A';
      let badgeLabel = `WP ${idx}`;

      if (isServo) {
        bgColor = wp.seederActive ? '#2D6A4F' : '#b45309';
        textColor = '#ffffff';
        borderColor = wp.seederActive ? '#4ade80' : '#f59e0b';
        badgeLabel = wp.seederActive ? `Row ON` : `Turn OFF`;
      } else if (isRTL) {
        bgColor = '#dc2626';
        textColor = '#ffffff';
        borderColor = '#991b1b';
        badgeLabel = `RTL Home`;
      }

      if (isCurrent) {
        borderColor = '#4ade80';
      }

      const customIcon = L.divIcon({
        className: 'custom-wp-marker',
        html: `
          <div style="
            position: relative;
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            transform: translate(-50%, -50%);
            cursor: grab;
          ">
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 2px;
              padding: 2px 6px;
              background-color: ${bgColor};
              color: ${textColor};
              border: 2px solid ${borderColor};
              border-radius: 12px;
              font-size: 10px;
              font-weight: 800;
              font-family: monospace;
              white-space: nowrap;
              box-shadow: 0 3px 10px rgba(0,0,0,0.5);
            ">
              ${isCurrent ? '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#4ade80; animation:ping 1s infinite;"></span>' : ''}
              <span>#${idx}</span>
              <span style="font-size: 8px; opacity: 0.85; margin-left: 2px;">${badgeLabel}</span>
            </div>
            <div style="width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:5px solid ${borderColor};"></div>
          </div>
        `,
        iconSize: [60, 30],
        iconAnchor: [30, 30],
      });

      const marker = L.marker([wp.lat, wp.lng], {
        icon: customIcon,
        draggable: true,
      });

      marker.on('dragend', (e) => {
        const newPos = (e.target as L.Marker).getLatLng();
        playBeepSound(500, 0.08);
        hapticLight();
        onWaypointsChange((prev) => {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lat: newPos.lat,
            lng: newPos.lng,
          };
          return updated;
        });
      });

      marker.bindPopup(`
        <div style="font-family: sans-serif; min-width: 180px; padding: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 6px;">
            <strong style="color: #012d1d; font-size: 13px;">Waypoint #${idx} (${badgeLabel})</strong>
            <span style="background: #e2e8f0; font-size: 10px; font-weight: bold; padding: 2px 5px; border-radius: 4px;">${wp.command}</span>
          </div>
          <div style="font-size: 11px; color: #444; line-height: 1.5;">
            <div><strong>Lat:</strong> ${wp.lat.toFixed(6)}</div>
            <div><strong>Lng:</strong> ${wp.lng.toFixed(6)}</div>
            <div><strong>Seeder Motor:</strong> ${wp.seederActive ? '<span style="color: #2D6A4F; font-weight: bold;">ON (1800 µs)</span>' : '<span style="color: #999;">OFF</span>'}</div>
            <div><strong>Speed:</strong> ${wp.speedKmh} km/h</div>
            <div><strong>Target Depth:</strong> ${wp.targetDepthCm} cm</div>
          </div>
        </div>
      `);

      marker.addTo(layerGroup);
    });

    // Auto-fit bounds on mission change
    if (waypoints.length > 0) {
      const bounds = L.latLngBounds(waypoints.map((wp) => [wp.lat, wp.lng]));
      bounds.extend([telemetry.lat, telemetry.lng]);
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 19 });
    }
  }, [waypoints, activeWpIndex, boundaryPoints, measurePoints, mapMode, swathWidthMeters]);

  // Update Tractor Marker & Heading Vector in Real Time
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const tractorLat = telemetry.lat;
    const tractorLng = telemetry.lng;
    const heading = telemetry.headingDeg;

    // Update Breadcrumbs
    if (breadcrumbsRef.current) {
      breadcrumbsRef.current.addLatLng([tractorLat, tractorLng]);
    }

    // Custom Tractor Rover Icon with heading rotation
    const tractorIcon = L.divIcon({
      className: 'tractor-live-marker',
      html: `
        <div style="
          position: relative;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <!-- Pulse Aura -->
          <div style="
            position: absolute;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(74, 222, 128, 0.25);
            border: 2px solid #4ade80;
            animation: pulse 2s infinite;
          "></div>
          
          <!-- Rotated Tractor Body -->
          <div style="
            width: 26px;
            height: 34px;
            background: #012d1d;
            border: 2px solid #4ade80;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: 3px 0;
            box-shadow: 0 4px 10px rgba(0,0,0,0.6);
            transform: rotate(${heading}deg);
            transition: transform 0.3s ease-out;
          ">
            <!-- Front Heading Pointer -->
            <div style="width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 6px solid #4ade80; margin-top: -8px;"></div>
            <!-- Cab Roof -->
            <div style="width: 14px; height: 10px; background: #2D6A4F; border-radius: 2px;"></div>
            <!-- Seeder Bar -->
            <div style="width: 22px; height: 3px; background: ${telemetry.seederActive ? '#4ade80' : '#888'}; border-radius: 1px;"></div>
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    if (!isRoverEnabled) {
      if (tractorMarkerRef.current) {
        tractorMarkerRef.current.remove();
        tractorMarkerRef.current = null;
      }
      return;
    }

    if (!tractorMarkerRef.current) {
      tractorMarkerRef.current = L.marker([tractorLat, tractorLng], { icon: tractorIcon, zIndexOffset: 1000 }).addTo(map);
      tractorMarkerRef.current.bindPopup(`
        <div style="font-family: sans-serif; padding: 2px;">
          <strong style="color: #012d1d; font-size: 13px;">🚜 AgriRover Precision Drill</strong>
          <div style="font-size: 11px; margin-top: 4px; color: #444;">
            <div><strong>Heading:</strong> ${heading}°</div>
            <div><strong>Speed:</strong> ${telemetry.groundspeedKmh.toFixed(1)} km/h</div>
            <div><strong>RTK Fix:</strong> ${telemetry.gpsFixType} (${telemetry.rtkAccuracyCm} cm)</div>
            <div><strong>Mode:</strong> ${telemetry.mode} (${telemetry.armed ? 'ARMED' : 'DISARMED'})</div>
          </div>
        </div>
      `);
    } else {
      tractorMarkerRef.current.setLatLng([tractorLat, tractorLng]);
      tractorMarkerRef.current.setIcon(tractorIcon);
    }
  }, [isRoverEnabled, telemetry.lat, telemetry.lng, telemetry.headingDeg, telemetry.seederActive, telemetry.groundspeedKmh, telemetry.gpsFixType, telemetry.mode, telemetry.armed]);

  // Center on Vehicle
  const handleCenterOnTractor = () => {
    if (!mapInstanceRef.current || !isRoverEnabled) return;
    playClickSound();
    hapticLight();
    mapInstanceRef.current.setView([telemetry.lat, telemetry.lng], 18, { animate: true });
  };

  // Locate User Device GPS Position & Enable Rover & Mapping
  const handleLocateUser = () => {
    if (!('geolocation' in navigator)) {
      setLocationToast('Geolocation is not supported by your browser.');
      return;
    }

    playClickSound();
    hapticLight();
    setIsLocating(true);
    setLocationToast('Acquiring live GPS coordinates...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude, accuracy });
        setIsRoverEnabled(true);
        setIsLocating(false);
        playBeepSound(750, 0.12);
        hapticSuccess();
        setLocationToast(`📍 Located at: ${latitude.toFixed(6)}°N, ${longitude.toFixed(6)}°E (±${accuracy.toFixed(1)}m). AgriRover & mapping enabled!`);

        // Update rover telemetry
        if (onUpdateTelemetry) {
          onUpdateTelemetry((prev) => ({
            ...prev,
            lat: latitude,
            lng: longitude,
            isConnected: true,
            rtkAccuracyCm: Math.min(accuracy * 100, 2.5),
            gpsFixType: 'RTK_FIXED',
          }));
        }

        // We just locate the user. We no longer auto-generate the grid here,
        // so the user can manually add their own waypoints.

        if (mapInstanceRef.current) {
          const map = mapInstanceRef.current;
          map.flyTo([latitude, longitude], 18, { duration: 1.5 });

          // Draw / Update User Marker
          const userIcon = L.divIcon({
            className: 'user-live-loc-marker',
            html: `
              <div style="
                position: relative;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <div style="position: absolute; inset: -8px; border-radius: 50%; background: rgba(59, 130, 246, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                <div style="width: 16px; height: 16px; border-radius: 50%; background: #2563eb; border: 3px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          if (userLocationMarkerRef.current) {
            userLocationMarkerRef.current.setLatLng([latitude, longitude]);
          } else {
            userLocationMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon, zIndexOffset: 2000 }).addTo(map);
            userLocationMarkerRef.current.bindPopup(`
              <div style="font-family: sans-serif; padding: 2px;">
                <strong style="color: #1d4ed8; font-size: 13px;">📍 You Are Here (Current Location)</strong>
                <div style="font-size: 11px; margin-top: 4px; color: #444;">
                  <div><strong>Lat:</strong> ${latitude.toFixed(6)}°</div>
                  <div><strong>Lng:</strong> ${longitude.toFixed(6)}°</div>
                  <div><strong>Accuracy:</strong> ±${accuracy.toFixed(1)} meters</div>
                </div>
              </div>
            `);
          }

          if (userAccuracyCircleRef.current) {
            userAccuracyCircleRef.current.setLatLng([latitude, longitude]);
            userAccuracyCircleRef.current.setRadius(accuracy);
          } else {
            userAccuracyCircleRef.current = L.circle([latitude, longitude], {
              radius: accuracy,
              color: '#3b82f6',
              weight: 1.5,
              fillColor: '#60a5fa',
              fillOpacity: 0.15,
            }).addTo(map);
          }
        }
      },
      (err) => {
        setIsLocating(false);
        let msg = 'Could not get current location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location access was denied. Please allow GPS permission in your browser to enable mapping.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location request timed out. Please retry.';
        }
        setLocationToast(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );
  };

  // Generate Field Grid at User Current Location
  const handleGenerateAtUserLocation = () => {
    if (!userLocation) {
      handleLocateUser();
      return;
    }
    playClickSound();
    hapticSuccess();
    const newGrid = generateFieldGrid(
      selectedCrop.name,
      swathWidthMeters,
      userLocation.lat,
      userLocation.lng,
      150,
      6,
      parseFloat(selectedCrop.sowingDepth) || 4.0,
      parseFloat(selectedCrop.seedSpacing) || 18.0
    );
    onWaypointsChange(newGrid);
    setLocationToast(`🌾 Auto-generated 6-row sowing grid at your current GPS coordinates!`);
  };

  // Fit bounds to entire mission
  const handleFitMission = () => {
    if (!mapInstanceRef.current || waypoints.length === 0) return;
    playClickSound();
    hapticLight();
    const bounds = L.latLngBounds(waypoints.map((wp) => [wp.lat, wp.lng]));
    if (isRoverEnabled) bounds.extend([telemetry.lat, telemetry.lng]);
    mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], animate: true });
  };

  // Clear Boundary or Measure
  const handleClearDrawing = () => {
    playClickSound();
    setBoundaryPoints([]);
    setMeasurePoints([]);
    setMeasuredDistance(null);
  };

  // Generate Mission from Boundary Polygon
  const handleGenerateFromBoundary = () => {
    if (boundaryPoints.length < 3) return;
    playClickSound();
    hapticSuccess();

    // Bounding Box of Polygon
    const lats = boundaryPoints.map((p) => p[0]);
    const lngs = boundaryPoints.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;

    // Estimate swath rows
    const lngStep = (swathWidthMeters / 111320) * 1.2;
    const numRows = Math.max(3, Math.min(16, Math.floor(lngSpan / lngStep)));

    const newWaypoints: Waypoint[] = [];
    let wpIdx = 0;

    // Home
    newWaypoints.push({
      index: wpIdx++,
      command: 'WAYPOINT',
      lat: minLat,
      lng: minLng,
      alt: 0,
      param1: 0,
      param2: 1.0,
      param3: 0,
      param4: 0,
      seederActive: false,
      speedKmh: 4.0,
      targetDepthCm: parseFloat(selectedCrop.sowingDepth) || 4.0,
      targetSpacingCm: parseFloat(selectedCrop.seedSpacing) || 18.0,
    });

    for (let r = 0; r < numRows; r++) {
      const curLng = minLng + r * (lngSpan / numRows);
      const isEven = r % 2 === 0;
      const startLat = isEven ? minLat : maxLat;
      const endLat = isEven ? maxLat : minLat;

      // Start of row -> Seeder ON
      newWaypoints.push({
        index: wpIdx++,
        command: 'DO_SET_SERVO',
        lat: startLat,
        lng: curLng,
        alt: 0,
        param1: 9,
        param2: 1800,
        param3: 0,
        param4: 0,
        seederActive: true,
        speedKmh: 8.5,
        targetDepthCm: parseFloat(selectedCrop.sowingDepth) || 4.0,
        targetSpacingCm: parseFloat(selectedCrop.seedSpacing) || 18.0,
      });

      // End of row
      newWaypoints.push({
        index: wpIdx++,
        command: 'WAYPOINT',
        lat: endLat,
        lng: curLng,
        alt: 0,
        param1: 0,
        param2: 1.0,
        param3: 0,
        param4: 0,
        seederActive: true,
        speedKmh: 8.5,
        targetDepthCm: parseFloat(selectedCrop.sowingDepth) || 4.0,
        targetSpacingCm: parseFloat(selectedCrop.seedSpacing) || 18.0,
      });

      // Headland Turn -> Seeder OFF
      newWaypoints.push({
        index: wpIdx++,
        command: 'DO_SET_SERVO',
        lat: endLat,
        lng: curLng,
        alt: 0,
        param1: 9,
        param2: 1000,
        param3: 0,
        param4: 0,
        seederActive: false,
        speedKmh: 3.5,
        targetDepthCm: 0,
        targetSpacingCm: parseFloat(selectedCrop.seedSpacing) || 18.0,
      });
    }

    // RTL
    newWaypoints.push({
      index: wpIdx++,
      command: 'RETURN_TO_LAUNCH',
      lat: minLat,
      lng: minLng,
      alt: 0,
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      seederActive: false,
      speedKmh: 5.0,
      targetDepthCm: 0,
      targetSpacingCm: 18.0,
    });

    onWaypointsChange(newWaypoints);
    setBoundaryPoints([]);
    setMapMode('view');
  };

  return (
    <div className={`relative w-full ${isFullscreen ? 'fixed inset-0 z-50 p-4 bg-black/90 backdrop-blur-md flex flex-col' : 'flex flex-col gap-3'}`}>
      {/* Top Map Control Bar */}
      <div className="bg-[#012d1d] text-white border-2 border-[#0A0A0A] rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-sm">
        {/* Layer Picker */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/10">
          <Layers className="w-4 h-4 text-[#4ade80] ml-1 mr-0.5" />
          {(['satellite', 'dark', 'osm', 'terrain'] as MapLayerType[]).map((type) => (
            <button
              key={type}
              onClick={() => {
                playClickSound();
                setActiveLayer(type);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase transition-all cursor-pointer ${
                activeLayer === type
                  ? 'bg-[#4ade80] text-[#012d1d] shadow-xs'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {type === 'satellite' ? 'Satellite' : type === 'dark' ? 'HUD Dark' : type === 'osm' ? 'Map' : 'Terrain'}
            </button>
          ))}
        </div>

        {/* Map Tool Modes */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              playClickSound();
              setMapMode(mapMode === 'add_waypoint' ? 'view' : 'add_waypoint');
            }}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-all ${
              mapMode === 'add_waypoint'
                ? 'bg-[#4ade80] text-[#012d1d] border-[#4ade80] shadow-sm'
                : 'bg-black/40 text-gray-200 border-white/20 hover:bg-white/10'
            }`}
            title="Click on the map to drop new Waypoints"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add WP</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              setMapMode(mapMode === 'draw_boundary' ? 'view' : 'draw_boundary');
            }}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-all ${
              mapMode === 'draw_boundary'
                ? 'bg-[#4ade80] text-[#012d1d] border-[#4ade80] shadow-sm'
                : 'bg-black/40 text-gray-200 border-white/20 hover:bg-white/10'
            }`}
            title="Draw field boundary to auto-fit grid"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Boundary</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              setMapMode(mapMode === 'measure' ? 'view' : 'measure');
            }}
            className={`p-1.5 rounded-lg border cursor-pointer transition-all ${
              mapMode === 'measure'
                ? 'bg-[#4ade80] text-[#012d1d] border-[#4ade80]'
                : 'bg-black/40 text-gray-200 border-white/20 hover:bg-white/10'
            }`}
            title="Measure distance between crop rows"
          >
            <Ruler className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick View & Locate Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleLocateUser}
            disabled={isLocating}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs ${
              isLocating
                ? 'bg-blue-600 text-white border-blue-400 animate-pulse'
                : isRoverEnabled
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-400'
                : 'bg-[#4ade80] hover:bg-[#38c86d] text-[#012d1d] border-black font-extrabold animate-pulse'
            }`}
            title="Locate my GPS position to enable AgriRover and field mapping"
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LocateFixed className="w-3.5 h-3.5" />
            )}
            <span>
              {isLocating ? 'Locating...' : isRoverEnabled ? 'Re-Locate GPS' : 'Locate Me'}
            </span>
          </button>

          {userLocation && (
            <button
              onClick={handleGenerateAtUserLocation}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold border border-emerald-400 flex items-center gap-1 cursor-pointer transition-all shadow-xs"
              title="Generate sowing grid around your current GPS location"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Plant Here</span>
            </button>
          )}

          <button
            onClick={handleCenterOnTractor}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              isRoverEnabled
                ? 'bg-black/40 hover:bg-white/10 text-white border-white/20'
                : 'bg-black/20 text-gray-500 border-white/10 cursor-not-allowed'
            }`}
            disabled={!isRoverEnabled}
            title="Center on Tractor"
          >
            <Crosshair className="w-4 h-4 text-[#4ade80]" />
          </button>

          <button
            onClick={handleFitMission}
            className="p-1.5 bg-black/40 hover:bg-white/10 border border-white/20 rounded-lg text-white cursor-pointer"
            title="Fit Mission Extents"
          >
            <Compass className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              playClickSound();
              setIsFullscreen(!isFullscreen);
            }}
            className="p-1.5 bg-black/40 hover:bg-white/10 border border-white/20 rounded-lg text-white cursor-pointer"
            title="Toggle Fullscreen Map"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Location Status Toast Banner */}
      {locationToast && (
        <div className="bg-blue-50 border-2 border-blue-400 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs text-blue-950 animate-fadeIn">
          <div className="flex items-center gap-2">
            <LocateFixed className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="font-semibold">{locationToast}</span>
          </div>
          <button
            onClick={() => setLocationToast(null)}
            className="text-blue-700 hover:text-blue-950 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Mode Status & Action Hint Banner */}
      {mapMode !== 'view' && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs text-amber-950 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {mapMode === 'add_waypoint' && '📍 Click anywhere on the map to append a new sowing waypoint.'}
              {mapMode === 'draw_boundary' && `📐 Click points on satellite map to enclose field (${boundaryPoints.length} points placed).`}
              {mapMode === 'measure' && `📏 Click 2 or more points to measure field distance (${measuredDistance ? `${measuredDistance.toFixed(1)} meters / ${(measuredDistance * 3.28084).toFixed(0)} ft` : 'Measuring...'})`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {mapMode === 'draw_boundary' && boundaryPoints.length >= 3 && (
              <button
                onClick={handleGenerateFromBoundary}
                className="px-2.5 py-1 bg-[#012d1d] hover:bg-[#1b4332] text-white font-bold rounded-lg cursor-pointer"
              >
                Auto-Fill Grid ({swathWidthMeters}m Swaths)
              </button>
            )}
            <button
              onClick={handleClearDrawing}
              className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-800 font-bold border border-gray-300 rounded-lg cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Leaflet Map Canvas Container */}
      <div
        className={`relative w-full ${isFullscreen ? 'flex-1 min-h-[500px]' : 'h-[360px] sm:h-[420px]'} border-4 border-[#0A0A0A] rounded-2xl overflow-hidden shadow-md bg-[#18231c]`}
      >
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Unlocated Overlay: Prompts user to click Locate Me to enable mapping & rover */}
        {!isRoverEnabled && (
          <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center select-none">
            <div className="bg-[#012d1d] border-2 border-[#4ade80] rounded-2xl p-5 shadow-2xl max-w-[280px] sm:max-w-xs flex flex-col items-center gap-3 animate-fadeIn">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-[#4ade80] flex items-center justify-center text-[#4ade80]">
                <LocateFixed className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex flex-col gap-1">
                <h4 className="text-white font-extrabold text-sm uppercase font-['Public_Sans']">
                  Field Location Required
                </h4>
                <p className="text-gray-300 text-xs leading-relaxed">
                  Tap <strong>Locate Me</strong> to acquire your real-time GPS coordinates and activate the AgriRover and sowing map.
                </p>
              </div>
              <button
                onClick={handleLocateUser}
                disabled={isLocating}
                className="w-full py-2.5 px-4 bg-[#4ade80] hover:bg-[#38c86d] text-[#012d1d] font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-95"
              >
                {isLocating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Acquiring GPS...</span>
                  </>
                ) : (
                  <>
                    <LocateFixed className="w-4 h-4" />
                    <span>Locate Me & Enable Rover</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Map Legend Overlay */}
        <div className="absolute bottom-3 left-3 z-20 bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border border-white/20 text-[11px] text-white flex flex-wrap items-center gap-3 shadow-lg pointer-events-none select-none">
          {isRoverEnabled && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 bg-[#4ade80] rounded-full inline-block" />
                <span className="font-bold">Sowing Swath</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 bg-amber-400 border-dashed border-t inline-block" />
                <span className="font-bold">Headland Turn</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#012d1d] border border-[#4ade80] inline-block" />
                <span className="font-bold">AgriRover</span>
              </div>
            </>
          )}
          {userLocation && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-white inline-block animate-ping" />
              <span className="font-bold text-blue-300">You ({userLocation.lat.toFixed(4)}°, {userLocation.lng.toFixed(4)}°)</span>
            </div>
          )}
          {!isRoverEnabled && !userLocation && (
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="font-bold">GPS Standby • Tap Locate Me to Activate</span>
            </div>
          )}
        </div>

        {/* Live GPS Telemetry Overlay Chip */}
        {isRoverEnabled && (
          <div className="absolute top-3 right-3 z-20 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-[11px] font-mono text-white flex items-center gap-2 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-[#4ade80] animate-ping" />
            <span>{telemetry.lat.toFixed(6)}°N, {telemetry.lng.toFixed(6)}°E</span>
            <span className="text-[#4ade80] font-bold">| {telemetry.gpsFixType}</span>
          </div>
        )}
      </div>
    </div>
  );
};
