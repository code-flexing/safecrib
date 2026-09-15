import sharp from 'sharp';

export async function computePhash(imageBuffer: Buffer): Promise<string> {
  const { data, info } = await sharp(imageBuffer)
    .resize(32, 32, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: number[] = [];
  for (let i = 0; i < data.length; i++) {
    pixels.push(data[i]);
  }

  const dctLow = dct2D(pixels, info.width, info.height);
  const lowFreq: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      lowFreq.push(dctLow[y * info.width + x]);
    }
  }

  const mean = lowFreq.slice(1).reduce((a, b) => a + b, 0) / (lowFreq.length - 1);
  let hash = '';
  for (let i = 1; i < lowFreq.length; i++) {
    hash += lowFreq[i] > mean ? '1' : '0';
  }

  return hash;
}

function dct2D(pixels: number[], width: number, height: number): number[] {
  const result: number[] = Array.from({ length: width * height }, () => 0);
  const rowResult: number[] = Array.from({ length: width }, () => 0);

  const cosTable = precomputeCosTable(Math.max(width, height));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rowResult[x] = pixels[y * width + x];
    }
    const dctRow = dct1D(rowResult, width, cosTable);
    for (let x = 0; x < width; x++) {
      result[y * width + x] = dctRow[x];
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      rowResult[y] = result[y * width + x];
    }
    const dctCol = dct1D(rowResult, height, cosTable);
    for (let y = 0; y < height; y++) {
      result[y * width + x] = dctCol[y];
    }
  }

  return result;
}

function dct1D(signal: number[], n: number, cosTable: Float32Array): number[] {
  const result: number[] = Array.from({ length: n }, () => 0);

  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += signal[i] * cosTable[k * n + i];
    }
    const ck = k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n);
    result[k] = ck * sum;
  }

  return result;
}

function precomputeCosTable(maxN: number): Float32Array {
  const table = new Float32Array(maxN * maxN);
  for (let k = 0; k < maxN; k++) {
    for (let i = 0; i < maxN; i++) {
      table[k * maxN + i] = Math.cos(((2 * i + 1) * k * Math.PI) / (2 * maxN));
    }
  }
  return table;
}
