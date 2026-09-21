import { useState, useEffect, useCallback } from 'react';

export interface GeoLocationState {
  lat: number;
  lng: number;
  accuracy: number; // in meters
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export function useCurrentLocation() {
  const [location, setLocation] = useState<GeoLocationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocation = useCallback((): Promise<GeoLocationState> => {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        const errMsg = 'Geolocation is not supported by your browser/device.';
        setError(errMsg);
        reject(new Error(errMsg));
        return;
      }

      setLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLoc: GeoLocationState = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          };
          setLocation(newLoc);
          setLoading(false);
          resolve(newLoc);
        },
        (err) => {
          let errDetail = 'Failed to retrieve location.';
          if (err.code === err.PERMISSION_DENIED) {
            errDetail = 'Location permission was denied. Please allow location access.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errDetail = 'GPS position is currently unavailable.';
          } else if (err.code === err.TIMEOUT) {
            errDetail = 'Location request timed out.';
          }
          setError(errDetail);
          setLoading(false);
          reject(new Error(errDetail));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    });
  }, []);

  // Request location on initial mount if permission is already granted
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          if (result.state === 'granted') {
            fetchLocation().catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [fetchLocation]);

  return {
    location,
    loading,
    error,
    fetchLocation,
  };
}
