const test = require("node:test");
const assert = require("node:assert/strict");
const depth = require("../globe-depth.js");

function fakeGlobe({ terrainFails = false } = {}) {
  const handlers = {};
  const loaded = { count: 0, lastUrl: null, creditFlag: false, terrainCalls: 0 };
  const callbacks = {};
  const globe = { show: true, maximumScreenSpaceError: 3, pick: () => ({center: true}) };
  const viewer = {
    camera: {
      positionCartographic: { height: 150000, longitude: 0, latitude: 0 },
      heading: 0.3,
      getPickRay: () => ({}),
      moveEnd: { addEventListener: fn => { handlers.moveEnd = fn; } },
      flyToBoundingSphere: () => { loaded.tilt = (loaded.tilt || 0) + 1; },
      zoomIn: n => { viewer.camera.positionCartographic.height -= n; },
      zoomOut: n => { viewer.camera.positionCartographic.height += n; }
    },
    terrainProvider: null,
    scene: {
      canvas: { clientWidth: 800, clientHeight: 600 },
      globe,
      screenSpaceCameraController: {},
      primitives: {
        add: t => { loaded.count += 1; return t; },
        remove: () => { loaded.count -= 1; }
      }
    }
  };
  const C = {
    Math: { toRadians: v => v * Math.PI / 180 },
    Cartesian2: class { constructor(x,y) { this.x=x;this.y=y; } },
    Cartesian3: { fromRadians: (lon,lat,z) => ({lon,lat,z}) },
    HeadingPitchRange: class { constructor(h,p,r) { this.heading=h; this.pitch=p; this.range=r; } },
    BoundingSphere: class { constructor(center,radius) { this.center=center;this.radius=radius; } },
    ArcGISTiledElevationTerrainProvider: {
      fromUrl: async url => { loaded.terrainCalls++; if(terrainFails)throw Error("down"); return {url}; }
    },
    Cesium3DTileset: {
      fromUrl: async (url, options) => {
        loaded.lastUrl = url;
        loaded.creditFlag = options.showCreditsOnScreen;
        return {
          show: false,
          tileLoad: {addEventListener:fn=>{callbacks.tileLoad=fn;}},
          initialTilesLoaded: {addEventListener:fn=>{callbacks.initialTilesLoaded=fn;}},
          tileFailed: {addEventListener:fn=>{callbacks.tileFailed=fn;}}
        };
      }
    }
  };
  const notices=[];
  const modes=[];
  const controller = depth.create({Cesium:C,viewer,notify:s=>notices.push(s),onStatus:s=>modes.push(s)});
  return {viewer, controller, loaded, callbacks, notices, modes, handlers};
}

test("close terrain mode is altitude-aware without calling Google", async () => {
  const env = fakeGlobe();
  env.controller.attach();
  await env.controller.enableTerrain();
  assert.equal(env.loaded.terrainCalls, 1);
  assert.ok(env.viewer.terrainProvider);
  assert.equal(env.viewer.scene.screenSpaceCameraController.minimumZoomDistance, 2);
  assert.equal(depth.modeForAltitude(200, false, true), "3D TERRAIN");
  assert.equal(depth.modeForAltitude(120000, false, true), "3D EARTH");
  assert.equal(env.loaded.lastUrl, null);
});
test("3D terrain failure leaves the satellite globe working", async () => {
  const env = fakeGlobe({terrainFails:true});
  assert.equal(await env.controller.enableTerrain(), false);
  assert.equal(env.viewer.scene.globe.show, true);
  assert.ok(env.notices.some(s=>s.includes("elevation")));
});
test("camera automatically tilts once near ground and resets after zooming away", () => {
  const env = fakeGlobe();
  env.viewer.camera.positionCartographic.height = 2500;
  env.controller.update();
  env.controller.update();
  assert.equal(env.loaded.tilt, 1);
  env.viewer.camera.positionCartographic.height = 40000;
  env.controller.update();
  env.viewer.camera.positionCartographic.height = 1800;
  env.controller.update();
  assert.equal(env.loaded.tilt, 2);
});
test("Google photoreal mode is opt-in and never activated at global zoom", async () => {
  const env = fakeGlobe();
  assert.equal(env.controller.enablePhoto("abc"), false);
  assert.equal(env.loaded.lastUrl, null);
  const secret = "AIzaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal(env.controller.enablePhoto(secret), true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(env.loaded.lastUrl, null, "no paid requests until the camera is near");
  env.viewer.camera.positionCartographic.height = 12000;
  env.controller.update();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(env.loaded.lastUrl?.startsWith("https://tile.googleapis.com/v1/3dtiles/root.json?key="));
  assert.equal(env.loaded.creditFlag, true, "Google tile attribution must be enabled");
  assert.equal(env.viewer.scene.globe.show,true,"satellite imagery remains until real 3D loads");
  env.callbacks.tileLoad();
  assert.equal(env.viewer.scene.globe.show,false);
  assert.equal(env.controller.getStatus().photoContentLoaded,true);
  env.viewer.camera.positionCartographic.height=100000;
  env.controller.update();
  assert.equal(env.viewer.scene.globe.show,true);
  env.controller.disablePhoto();
  assert.equal(env.loaded.count,0);
  assert.ok(!JSON.stringify(env.modes).includes(secret),"status callbacks cannot leak API key");
});
test("close-zoom bounds allow near-ground viewing", () => {
  assert.ok(depth.LIMITS.minimumZoomMeters <= 2);
  assert.ok(depth.LIMITS.photorealStartMeters < depth.LIMITS.photorealStopMeters);
  assert.equal(depth.shouldUsePhoto(20000,false),true);
  assert.equal(depth.shouldUsePhoto(60000,false),false);
  assert.equal(depth.shouldUsePhoto(60000,true),true);
});
