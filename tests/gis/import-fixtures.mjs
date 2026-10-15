import { crc32 } from 'node:zlib';
export function storedZip(entries) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content),
      filename = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(bytes), 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, bytes);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(bytes), 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += 30 + filename.length + bytes.length;
  }
  const directory = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export function syntheticShape() {
  const points = [
    [0, 0],
    [111319.49079327357, 0],
    [111319.49079327357, 111325.1428663851],
    [0, 111325.1428663851],
    [0, 0],
  ];
  const shp = Buffer.alloc(236);
  shp.writeInt32BE(9994, 0);
  shp.writeInt32BE(118, 24);
  shp.writeInt32LE(1000, 28);
  shp.writeInt32LE(5, 32);
  shp.writeInt32BE(1, 100);
  shp.writeInt32BE(64, 104);
  shp.writeInt32LE(5, 108);
  shp.writeInt32LE(1, 144);
  shp.writeInt32LE(5, 148);
  shp.writeInt32LE(0, 152);
  points.forEach(([x, y], i) => {
    shp.writeDoubleLE(x, 156 + i * 16);
    shp.writeDoubleLE(y, 164 + i * 16);
  });
  const dbf = Buffer.alloc(71, 0);
  dbf[0] = 3;
  dbf.writeUInt32LE(1, 4);
  dbf.writeUInt16LE(65, 8);
  dbf.writeUInt16LE(5, 10);
  dbf.write('code', 32);
  dbf[43] = 67;
  dbf[48] = 4;
  dbf[64] = 13;
  dbf[65] = 32;
  dbf.write('0001', 66);
  dbf[70] = 26;
  return { 'fixture.shp': shp, 'fixture.dbf': dbf, 'fixture.prj': 'EPSG:3857' };
}
export const featureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { code: 'DEMO-01', name: 'Synthetic only' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
};
