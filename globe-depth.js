/* GeoPulse close-range 3D Earth controller.
   Current ArcGIS imagery + elevation by default; Google 3D only after a
   person explicitly provides an API-restricted key and opts into billed tiles.
   Keys are never written to storage, logs, map links or GitHub. */
(function (root) {
  "use strict";

  const LIMITS = Object.freeze({
    minimumZoomMeters: 2,
    autoTiltBelowMeters: 3500,
    autoTiltResetAboveMeters: 20000,
    photorealStartMeters: 35000,
    photorealStopMeters: 65000
  });
  const TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
  const KEY_PATTERN = /^[A-Za-z0-9_-]{20,160}$/;

  function modeForAltitude(height, photorealActive, terrainAvailable) {
    if (photorealActive) return "PHOTOREAL 3D";
    if (!Number.isFinite(height) || height > 20000) return terrainAvailable ? "3D EARTH" : "SATELLITE EARTH";
    return terrainAvailable ? "3D TERRAIN" : "SURFACE SATELLITE";
  }
  function shouldUsePhoto(height, isLoaded) {
    return Number.isFinite(height) && height <= (isLoaded ? LIMITS.photorealStopMeters : LIMITS.photorealStartMeters);
  }

  function create(options) {
    const { Cesium: C, viewer, notify = () => {}, onStatus = () => {} } = options;
    let terrainAvailable = false;
    let photoEnabled = false;
    let photoKey = "";
    let tileset = null;
    let photoLoading = false;
    let photoContentLoaded = false;
    let autoTilted = false;
    let terrainProviderPromise = null;
    let loadingTimer = 0;
    let generation = 0;

    function heightMeters() {
      const h = viewer.camera.positionCartographic?.height;
      return Number.isFinite(h) ? h : Number.POSITIVE_INFINITY;
    }
    function emitStatus() {
      onStatus({
        mode: modeForAltitude(heightMeters(), photoContentLoaded && !!tileset?.show, terrainAvailable),
        terrainAvailable,
        photoEnabled,
        photoLoading,
        photoActive: photoContentLoaded && !!tileset?.show
      });
    }
    function restoreGlobe() {
      if (viewer.scene.globe) viewer.scene.globe.show = true;
    }
    function removePhoto() {
      if (loadingTimer) clearTimeout(loadingTimer);
      loadingTimer = 0;
      if (tileset) {
        tileset.show = false;
        viewer.scene.primitives.remove(tileset);
        tileset = null;
      }
      photoLoading = false;
      photoContentLoaded = false;
      restoreGlobe();
    }
    function disablePhoto() {
      generation += 1;
      photoEnabled = false;
      photoKey = "";
      removePhoto();
      emitStatus();
    }
    async function loadPhoto() {
      if (photoLoading || tileset || !photoEnabled || !photoKey || !shouldUsePhoto(heightMeters(), false)) return;
      const requestGeneration = generation;
      photoLoading = true;
      emitStatus();
      try {
        // Cesium resolves Google child tile URLs while keeping its map credits.
        const url = "https://tile.googleapis.com/v1/3dtiles/root.json?key=" + encodeURIComponent(photoKey);
        const next = await C.Cesium3DTileset.fromUrl(url, {
          showCreditsOnScreen: true,
          maximumScreenSpaceError: 14,
          dynamicScreenSpaceError: true
        });
        if (requestGeneration !== generation || !photoEnabled) {
          if (!next.isDestroyed?.()) next.destroy?.();
          return;
        }
        tileset = viewer.scene.primitives.add(next);
        tileset.show = shouldUsePhoto(heightMeters(), true);
        photoLoading = false;
        // Keep the original imagery visible until real 3D tile content renders.
        tileset.tileLoad?.addEventListener(() => {
          photoContentLoaded = true;
          update();
        });
        tileset.initialTilesLoaded?.addEventListener(() => {
          photoContentLoaded = true;
          update();
        });
        tileset.tileFailed?.addEventListener(() => {
          // One missing city tile should not take down the entire Earth viewer.
          if (!photoContentLoaded) notify("Some 3D tiles are unavailable. Satellite terrain remains the fallback.");
        });
        loadingTimer = setTimeout(() => {
          if (requestGeneration === generation && !photoContentLoaded && photoEnabled) {
            notify("3D buildings did not load. Falling back to satellite terrain; check the Google Tiles API key, quotas and browser console.");
            disablePhoto();
          }
        }, 18000);
        update();
      } catch (_error) {
        if (requestGeneration !== generation) return;
        disablePhoto();
        notify("Google 3D tiles could not start. Your satellite map is still available. Check your Maps Tile API setup, billing and key restrictions.");
      } finally {
        if (requestGeneration === generation) {
          photoLoading = false;
          emitStatus();
        }
      }
    }
    function updatePhoto() {
      const closeEnough = shouldUsePhoto(heightMeters(), !!tileset);
      if (!photoEnabled) {
        if (tileset) removePhoto();
        return;
      }
      if (!closeEnough) {
        if (tileset) tileset.show = false;
        restoreGlobe();
      } else if (tileset) {
        tileset.show = true;
        viewer.scene.globe.show = !photoContentLoaded;
      } else {
        void loadPhoto();
      }
    }
    function flyToOblique(rangeOverride) {
      if (!viewer || !viewer.scene || !viewer.camera) return false;
      const Cc = viewer.camera;
      const canvas = viewer.scene.canvas;
      const center = new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
      const ray = Cc.getPickRay(center);
      const point = ray && viewer.scene.globe?.pick(ray, viewer.scene);
      const ground = point || C.Cartesian3.fromRadians(
        Cc.positionCartographic.longitude, Cc.positionCartographic.latitude, 0);
      const distance = rangeOverride || Math.max(90, Math.min(2600, Math.max(90, heightMeters() * 0.8)));
      Cc.flyToBoundingSphere(new C.BoundingSphere(ground, 1), {
        offset: new C.HeadingPitchRange(Cc.heading, C.Math.toRadians(-43), distance),
        duration: 0.95
      });
      return true;
    }
    function update() {
      const height = heightMeters();
      if (height > LIMITS.autoTiltResetAboveMeters) autoTilted = false;
      if (height <= LIMITS.autoTiltBelowMeters && height > 20 && !autoTilted) {
        autoTilted = true;
        // Tilt only once per descent, not on each scroll frame.
        flyToOblique();
      }
      updatePhoto();
      emitStatus();
    }
    async function enableTerrain() {
      if (terrainProviderPromise) return terrainProviderPromise;
      terrainProviderPromise = (async () => {
        try {
          const provider = await C.ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_URL);
          viewer.terrainProvider = provider;
          terrainAvailable = true;
          viewer.scene.globe.maximumScreenSpaceError = 1.5;
          emitStatus();
          return true;
        } catch (_error) {
          terrainAvailable = false;
          notify("Detailed elevation is temporarily unavailable. The satellite globe still works.");
          emitStatus();
          return false;
        }
      })();
      return terrainProviderPromise;
    }
    function enablePhoto(key) {
      const normalized = String(key || "").trim();
      if (!KEY_PATTERN.test(normalized)) return false;
      // Never persist this session's API key in a URL, localStorage or a file.
      if (photoEnabled) disablePhoto();
      generation += 1;
      photoKey = normalized;
      photoEnabled = true;
      updatePhoto();
      emitStatus();
      return true;
    }
    function zoom(direction) {
      const height = heightMeters();
      const amount = Math.min(3000000, Math.max(15, Math.max(0, height) * 0.4));
      if (direction > 0) viewer.camera.zoomIn(amount);
      else viewer.camera.zoomOut(amount);
      update();
    }
    function attach() {
      const controls = viewer.scene.screenSpaceCameraController;
      controls.minimumZoomDistance = LIMITS.minimumZoomMeters;
      controls.maximumZoomDistance = 30000000;
      controls.enableCollisionDetection = true;
      controls.zoomFactor = 2.7;
      viewer.camera.moveEnd.addEventListener(update);
      void enableTerrain();
      emitStatus();
    }
    return { attach, update, zoom, flyToOblique, enableTerrain, enablePhoto, disablePhoto,
      modeForAltitude, getStatus: () => ({ photoEnabled, terrainAvailable, photoContentLoaded }),
      limits: LIMITS };
  }

  const api = { create, modeForAltitude, shouldUsePhoto, LIMITS };
  root.GeoPulseDepth = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
