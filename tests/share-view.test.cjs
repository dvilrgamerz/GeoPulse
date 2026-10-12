const test = require('node:test');
const assert = require('node:assert/strict');
const share = require('../share-view.js');

test('camera position and basemap round trip through a copyable URL', () => {
  const view={lat:36.17,lon:-86.78,alt:2500000,heading:45,pitch:-60,map:'topo'};
  const url=share.build('https://example.com/',view);
  assert.deepEqual(share.decode(new URL(url).search),view);
  assert.ok(!url.includes('token'));
});
test('malformed and unsafe camera values are rejected', () => {
  assert.equal(share.decode('?lat=95&lon=0&alt=500&heading=0&pitch=-45&map=topo'),null);
  assert.equal(share.decode('?lat=1&lon=1&alt=0&heading=0&pitch=-45&map=topo'),null);
  assert.equal(share.decode('?lat=1&lon=1&alt=500&heading=0&pitch=-45&map=javascript'),null);
  assert.equal(share.decode('?lat=1&lon=1&alt=nan&heading=0&pitch=-45'),null);
});
test('unrelated query parameters survive view serialization', () => {
  const out=share.build('https://example.com/?lang=en',{lat:0,lon:0,alt:300,heading:0,pitch:-90,map:'satellite'});
  assert.equal(new URL(out).searchParams.get('lang'),'en');
});
